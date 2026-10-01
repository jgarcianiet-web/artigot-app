import { after } from "next/server";
import { bus } from "./bus";
import { db } from "./db";
import { notify } from "./push";

/**
 * Chat interno de RRHH, tipo WhatsApp: un grupo con todo RRHH, conversaciones de dos personas y
 * grupos con nombre. Solo lo ven los usuarios de RRHH (nunca el personal). Tiempo real por SSE,
 * fotos, «leído» (✓✓) y avisos al móvil a quien no está mirando.
 */

export const staffChannel = (roomId: string) => `staff:${roomId}`;
/** Canal por persona: avisa a su lista de conversaciones de que hay novedades. */
export const staffInbox = (adminId: string) => `staff-inbox:${adminId}`;

export type StaffChatMessage = { id: string; roomId: string; adminId: string | null; authorName: string; body: string; fileId: string | null; createdAt: string };
export type StaffEvent = { type: "message"; message: StaffChatMessage } | { type: "read"; adminId: string; at: string };

const toMsg = (m: { id: string; roomId: string; adminId: string | null; authorName: string; body: string; fileId: string | null; createdAt: Date }): StaffChatMessage => ({
  id: m.id, roomId: m.roomId, adminId: m.adminId, authorName: m.authorName, body: m.body, fileId: m.fileId, createdAt: m.createdAt.toISOString(),
});

/** El grupo de todo RRHH: se crea la primera vez y siempre incluye a todos los usuarios activos. */
export async function ensureGeneralRoom() {
  let room = await db.staffRoom.findFirst({ where: { kind: "GENERAL" } });
  room ??= await db.staffRoom.create({ data: { kind: "GENERAL", name: "Todo RRHH", createdBy: "Automático" } });
  const admins = await db.adminUser.findMany({ where: { active: true }, select: { id: true } });
  const members = new Set((await db.staffRoomMember.findMany({ where: { roomId: room.id }, select: { adminId: true } })).map((m) => m.adminId));
  const missing = admins.filter((a) => !members.has(a.id));
  if (missing.length) await db.staffRoomMember.createMany({ data: missing.map((a) => ({ roomId: room.id, adminId: a.id })), skipDuplicates: true });
  return room;
}

export async function isMember(roomId: string, adminId: string) {
  return !!(await db.staffRoomMember.findUnique({ where: { roomId_adminId: { roomId, adminId } } }));
}

/** Conversación de dos personas (la crea si no existe). */
export async function directRoom(me: { id: string; name: string }, otherId: string) {
  if (otherId === me.id) throw new Error("Elige a otra persona.");
  const other = await db.adminUser.findFirst({ where: { id: otherId, active: true } });
  if (!other) throw new Error("Esa persona no existe.");
  const existing = await db.staffRoom.findFirst({
    where: { kind: "DIRECTO", AND: [{ members: { some: { adminId: me.id } } }, { members: { some: { adminId: otherId } } }] },
  });
  return existing ?? db.staffRoom.create({ data: { kind: "DIRECTO", createdBy: me.name, members: { create: [{ adminId: me.id }, { adminId: otherId }] } } });
}

export async function createGroup(me: { id: string; name: string }, name: string, memberIds: string[]) {
  const n = name.trim().slice(0, 60);
  if (n.length < 2) throw new Error("Pon un nombre al grupo.");
  const ids = [...new Set([me.id, ...memberIds])];
  const valid = await db.adminUser.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
  if (valid.length < 2) throw new Error("Elige al menos a otra persona.");
  return db.staffRoom.create({ data: { kind: "GRUPO", name: n, createdBy: me.name, members: { create: valid.map((v) => ({ adminId: v.id })) } } });
}

/** Lista de conversaciones de una persona, con el último mensaje y los sin leer. */
export async function myRooms(adminId: string) {
  await ensureGeneralRoom();
  const memberships = await db.staffRoomMember.findMany({
    where: { adminId },
    include: {
      room: {
        include: {
          members: { include: { admin: { select: { id: true, name: true, active: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  const rows = await Promise.all(
    memberships.map(async (m) => {
      const r = m.room;
      const others = r.members.filter((x) => x.adminId !== adminId).map((x) => x.admin);
      const unread = await db.staffMessage.count({ where: { roomId: r.id, createdAt: { gt: m.lastReadAt }, NOT: { adminId } } });
      const last = r.messages[0];
      return {
        id: r.id,
        kind: r.kind,
        title: r.kind === "DIRECTO" ? (others[0]?.name ?? "Conversación") : (r.name ?? "Grupo"),
        subtitle: r.kind === "DIRECTO" ? "" : `${r.members.length} personas`,
        last: last ? { text: last.body || (last.fileId ? "📷 Foto" : ""), author: last.adminId === adminId ? "Tú" : last.authorName, at: last.createdAt.toISOString() } : null,
        lastAt: r.lastMessageAt.toISOString(),
        unread,
      };
    }),
  );
  // El grupo general siempre arriba si no hay mensajes; después, por el último mensaje
  return rows.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export const unreadTotal = async (adminId: string) => (await myRooms(adminId)).reduce((s, r) => s + r.unread, 0);

export async function roomMessages(roomId: string, take = 300) {
  const rows = await db.staffMessage.findMany({ where: { roomId }, orderBy: { createdAt: "desc" }, take });
  return rows.reverse().map(toMsg);
}

export async function roomInfo(roomId: string, adminId: string) {
  const room = await db.staffRoom.findUnique({ where: { id: roomId }, include: { members: { include: { admin: { select: { id: true, name: true } } } } } });
  if (!room || !room.members.some((m) => m.adminId === adminId)) return null;
  const others = room.members.filter((m) => m.adminId !== adminId);
  return {
    id: room.id,
    kind: room.kind,
    title: room.kind === "DIRECTO" ? (others[0]?.admin.name ?? "Conversación") : (room.name ?? "Grupo"),
    members: room.members.map((m) => ({ id: m.adminId, name: m.admin.name, lastReadAt: m.lastReadAt.toISOString() })),
  };
}

export async function postStaffMessage(me: { id: string; name: string }, roomId: string, text: string, fileId?: string) {
  const body = text.trim().slice(0, 4000);
  if (!body && !fileId) return null;
  const m = await db.staffMessage.create({ data: { roomId, adminId: me.id, authorName: me.name, body, fileId } });
  await db.staffRoom.update({ where: { id: roomId }, data: { lastMessageAt: m.createdAt } });
  const msg = toMsg(m);
  bus.emit(staffChannel(roomId), { type: "message", message: msg } satisfies StaffEvent);
  await markStaffRead(me.id, roomId, m.createdAt);
  after(async () => {
    const room = await db.staffRoom.findUniqueOrThrow({ where: { id: roomId }, include: { members: { include: { admin: { select: { id: true, name: true } } } } } });
    const others = room.members.filter((x) => x.adminId !== me.id);
    for (const o of others) bus.emit(staffInbox(o.adminId), roomId);
    const preview = body ? (body.length > 140 ? `${body.slice(0, 137)}…` : body) : "📷 Foto";
    await notify({
      adminNames: others.map((o) => o.admin.name),
      adminUrl: `/admin/mensajes/${roomId}`,
      title: room.kind === "DIRECTO" ? me.name : (room.name ?? "RRHH"),
      body: room.kind === "DIRECTO" ? preview : `${me.name}: ${preview}`,
      tag: `staff-${roomId}`,
    });
  });
  return msg;
}

export async function markStaffRead(adminId: string, roomId: string, when?: Date) {
  // La hora de los mensajes la pone la base de datos: se usa la del último para que el reloj del
  // servidor (que puede ir unos milisegundos por detrás) no deje un mensaje ya visto como no leído
  const latest = when ? null : await db.staffMessage.findFirst({ where: { roomId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const now = new Date();
  const at = when ?? (latest && latest.createdAt > now ? latest.createdAt : now);
  const r = await db.staffRoomMember.updateMany({ where: { roomId, adminId, lastReadAt: { lt: at } }, data: { lastReadAt: at } });
  if (r.count) bus.emit(staffChannel(roomId), { type: "read", adminId, at: at.toISOString() } satisfies StaffEvent);
}
