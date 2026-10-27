import { after } from "next/server";
import { bus, workerInbox } from "./bus";
import { db } from "./db";
import { deleteStoredFile } from "./files";
import { notify } from "./push";
import type { StaffChatMessage, StaffEvent } from "./staffChat";
import { pingAdmins } from "./workerChat";

/**
 * Grupos de chat de RRHH con el personal (p. ej. «Maîtres», «Fijos Segovia»), tipo WhatsApp. Los crea y gestiona RRHH
 * y los ve todo RRHH; cada trabajador solo ve los grupos en los que está. Con «solo RRHH escribe» funciona como un
 * canal de avisos. Tiempo real por SSE, fotos, «leído» y aviso al móvil (o email si no tiene avisos).
 *
 * Usa el formato de StaffChat: cada «miembro» es «rrhh» (todo RRHH) o el id de cada trabajador.
 */

export const GROUP_RRHH = "rrhh";
export const groupChannel = (groupId: string) => `group:${groupId}`;

type Row = { id: string; groupId: string; workerId: string | null; authorName: string; body: string; fileId: string | null; createdAt: Date };
const toMsg = (m: Row): StaffChatMessage => ({
  id: m.id, roomId: m.groupId, adminId: m.workerId ?? GROUP_RRHH, authorName: m.workerId ? m.authorName : `${m.authorName} (RRHH)`, body: m.body, fileId: m.fileId, createdAt: m.createdAt.toISOString(),
});
const preview = (body: string, fileId?: string | null) => (body ? (body.length > 140 ? `${body.slice(0, 137)}…` : body) : fileId ? "📷 Foto" : "");

export async function groupMessages(groupId: string, take = 300) {
  const rows = await db.groupMessage.findMany({ where: { groupId }, orderBy: { createdAt: "desc" }, take });
  return rows.reverse().map(toMsg);
}

/** El grupo con sus miembros y hasta dónde ha leído cada uno (para los ✓✓). */
export async function groupInfo(groupId: string) {
  const g = await db.workerGroup.findUnique({
    where: { id: groupId },
    include: { members: { include: { worker: { select: { id: true, name: true } } }, orderBy: { worker: { name: "asc" } } } },
  });
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    onlyStaff: g.onlyStaff,
    createdBy: g.createdBy,
    members: [
      { id: GROUP_RRHH, name: "RRHH", lastReadAt: g.staffReadAt?.toISOString() ?? "" },
      ...g.members.map((m) => ({ id: m.workerId, name: m.worker.name, lastReadAt: m.readAt?.toISOString() ?? "" })),
    ],
  };
}

export async function groupReads(groupId: string) {
  const info = await groupInfo(groupId);
  return Object.fromEntries((info?.members ?? []).map((m) => [m.id, m.lastReadAt]));
}

/** Quién usa el grupo: cualquiera de RRHH, o un trabajador que sea miembro. */
export type GroupSide = { side: "rrhh"; id: string; name: string } | { side: "worker"; id: string; name: string };

export async function isGroupMember(groupId: string, workerId: string) {
  return !!(await db.workerGroupMember.findUnique({ where: { groupId_workerId: { groupId, workerId } } }));
}

/** Crea o edita un grupo (nombre, «solo RRHH escribe» y miembros). */
export async function saveGroup(by: string, data: { id?: string; name: string; onlyStaff: boolean; workerIds: string[] }) {
  const name = data.name.trim().slice(0, 60);
  if (name.length < 2) throw new Error("Pon un nombre al grupo.");
  const valid = await db.worker.findMany({ where: { id: { in: [...new Set(data.workerIds)] }, active: true }, select: { id: true } });
  if (!valid.length) throw new Error("Elige al menos a una persona.");
  const ids = valid.map((v) => v.id);
  let groupId = data.id;
  let changed: string[] = ids;
  if (groupId) {
    const before = (await db.workerGroupMember.findMany({ where: { groupId }, select: { workerId: true } })).map((m) => m.workerId);
    await db.$transaction([
      db.workerGroup.update({ where: { id: groupId }, data: { name, onlyStaff: data.onlyStaff } }),
      db.workerGroupMember.deleteMany({ where: { groupId, workerId: { notIn: ids } } }),
      db.workerGroupMember.createMany({ data: ids.map((workerId) => ({ groupId: groupId!, workerId })), skipDuplicates: true }),
    ]);
    changed = [...ids.filter((id) => !before.includes(id)), ...before.filter((id) => !ids.includes(id))];
  } else {
    groupId = (await db.workerGroup.create({ data: { name, onlyStaff: data.onlyStaff, createdBy: by, members: { create: ids.map((workerId) => ({ workerId })) } } })).id;
  }
  // Los que entran o salen ven el cambio en su lista de chats al momento
  for (const id of changed) bus.emit(workerInbox(id), "group");
  await pingAdmins();
  return { id: groupId, members: ids.length };
}

export async function postGroup(from: GroupSide, groupId: string, text: string, fileId?: string) {
  const body = text.trim().slice(0, 4000);
  if (!body && !fileId) return null;
  const group = await db.workerGroup.findUnique({ where: { id: groupId }, include: { members: { select: { workerId: true } } } });
  if (!group) return null;
  const fromWorker = from.side === "worker";
  if (fromWorker && group.onlyStaff) throw new Error("En este grupo solo escribe RRHH.");
  const m = await db.groupMessage.create({
    data: { groupId, workerId: fromWorker ? from.id : null, adminId: fromWorker ? null : from.id, authorName: from.name, body, fileId },
  });
  // Quien escribe ya lo ha leído todo hasta su mensaje
  await db.workerGroup.update({ where: { id: groupId }, data: { lastMessageAt: m.createdAt, ...(fromWorker ? {} : { staffReadAt: m.createdAt }) } });
  if (fromWorker) await db.workerGroupMember.update({ where: { groupId_workerId: { groupId, workerId: from.id } }, data: { readAt: m.createdAt } });
  const msg = toMsg(m);
  bus.emit(groupChannel(groupId), { type: "message", message: msg } satisfies StaffEvent);
  bus.emit(groupChannel(groupId), { type: "read", adminId: fromWorker ? from.id : GROUP_RRHH, at: msg.createdAt } satisfies StaffEvent);
  const others = group.members.map((x) => x.workerId).filter((id) => !fromWorker || id !== from.id);
  for (const id of others) bus.emit(workerInbox(id), "group");
  after(async () => {
    await pingAdmins();
    const text = `${fromWorker ? from.name.split(" ")[0] : `${from.name.split(" ")[0]} (RRHH)`}: ${preview(body, fileId)}`;
    await notify({
      workerIds: others,
      workerUrl: `/app/grupos/${groupId}`,
      admins: fromWorker,
      adminUrl: `/admin/mensajes/grupos/${groupId}`,
      title: `👥 ${group.name}`,
      body: text,
      tag: `group-${groupId}`,
      // Los avisos de RRHH llegan también por email a quien no tiene la app con avisos
      emailFallback: !fromWorker,
    });
  });
  return msg;
}

export async function markGroupRead(from: GroupSide, groupId: string) {
  const latest = await db.groupMessage.findFirst({ where: { groupId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!latest) return;
  const now = new Date();
  const at = latest.createdAt > now ? latest.createdAt : now;
  const r =
    from.side === "rrhh"
      ? await db.workerGroup.updateMany({ where: { id: groupId, OR: [{ staffReadAt: null }, { staffReadAt: { lt: at } }] }, data: { staffReadAt: at } })
      : await db.workerGroupMember.updateMany({ where: { groupId, workerId: from.id, OR: [{ readAt: null }, { readAt: { lt: at } }] }, data: { readAt: at } });
  if (!r.count) return;
  bus.emit(groupChannel(groupId), { type: "read", adminId: from.side === "rrhh" ? GROUP_RRHH : from.id, at: at.toISOString() } satisfies StaffEvent);
  if (from.side === "rrhh") await pingAdmins();
  else bus.emit(workerInbox(from.id), "read");
}

/** Elimina el grupo con todos sus mensajes y fotos. */
export async function deleteGroup(groupId: string) {
  const g = await db.workerGroup.findUnique({ where: { id: groupId }, include: { members: { select: { workerId: true } }, files: { select: { id: true } } } });
  if (!g) return null;
  for (const f of g.files) await deleteStoredFile(f.id);
  await db.workerGroup.delete({ where: { id: groupId } });
  bus.emit(groupChannel(groupId), { type: "cleared" } satisfies StaffEvent);
  for (const m of g.members) bus.emit(workerInbox(m.workerId), "group");
  await pingAdmins();
  return g;
}

/** Grupos para la lista de RRHH, con el último mensaje y lo que han escrito los trabajadores sin leer. */
export async function staffGroups() {
  const groups = await db.workerGroup.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: { _count: { select: { members: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return Promise.all(
    groups.map(async (g) => {
      const last = g.messages[0];
      const unread = await db.groupMessage.count({ where: { groupId: g.id, workerId: { not: null }, ...(g.staffReadAt && { createdAt: { gt: g.staffReadAt } }) } });
      return {
        id: g.id,
        name: g.name,
        members: g._count.members,
        onlyStaff: g.onlyStaff,
        last: last ? { text: preview(last.body, last.fileId), author: last.workerId ? last.authorName.split(" ")[0] : `${last.authorName.split(" ")[0]} (RRHH)`, at: last.createdAt.toISOString() } : null,
        lastAt: g.lastMessageAt.toISOString(),
        unread,
      };
    }),
  );
}

/** Mensajes de trabajadores en grupos sin leer por RRHH (para el número del menú). */
export async function staffGroupUnread() {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "GroupMessage" m JOIN "WorkerGroup" g ON g.id = m."groupId"
    WHERE m."workerId" IS NOT NULL AND (g."staffReadAt" IS NULL OR m."createdAt" > g."staffReadAt")`;
  return Number(rows[0]?.n ?? 0);
}

/** Grupos de un trabajador (para su lista de Chats), con el último mensaje y los que no ha leído. */
export async function workerGroups(workerId: string) {
  const ms = await db.workerGroupMember.findMany({
    where: { workerId },
    include: { group: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: { group: { lastMessageAt: "desc" } },
  });
  return Promise.all(
    ms.map(async (m) => {
      const last = m.group.messages[0];
      const unread = await db.groupMessage.count({
        where: { groupId: m.groupId, OR: [{ workerId: null }, { workerId: { not: workerId } }], ...(m.readAt && { createdAt: { gt: m.readAt } }) },
      });
      return {
        id: m.groupId,
        name: m.group.name,
        last: last ? `${last.workerId === workerId ? "Tú" : last.authorName.split(" ")[0]}: ${preview(last.body, last.fileId)}` : null,
        unread,
      };
    }),
  );
}
