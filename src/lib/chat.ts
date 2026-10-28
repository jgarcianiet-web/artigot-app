import { after } from "next/server";
import type { Viewer } from "./auth";
import { addDays, isLeadRole, LEAD_ROLES, today } from "./domain";
import { bus, chatChannel, workerInbox } from "./bus";
import { db } from "./db";
import { notify } from "./push";

export const ADMIN_READER = "rrhh";
const RRHH_SUFFIX = " (RRHH)";
export const readerKey = (v: Viewer, groupId?: string | null) => `${v.kind === "admin" ? ADMIN_READER : `w:${v.id}`}${groupId ? `#g:${groupId}` : ""}`;

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  workerId: string | null;
  fromAdmin: boolean;
  fileId: string | null;
  lat: number | null;
  lng: number | null;
};

export const toChatMessage = (m: {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  workerId: string | null;
  fileId: string | null;
  lat: number | null;
  lng: number | null;
}): ChatMessage => ({
  id: m.id,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
  authorName: m.authorName,
  workerId: m.workerId,
  // Un trabajador eliminado deja sus mensajes sin workerId: solo cuentan como RRHH los firmados como tal
  fromAdmin: m.workerId === null && m.authorName.endsWith(RRHH_SUFFIX),
  fileId: m.fileId,
  lat: m.lat,
  lng: m.lng,
});

/**
 * Quién lee y escribe en el chat de un evento. RRHH, todo; un trabajador, solo si está confirmado.
 * Con «chat por grupos» (eventos grandes): cada grupo tiene su chat (su gente y los maîtres/responsables sin grupo,
 * que dirigen todo el evento) y el chat general es de avisos: lo leen todos y escriben RRHH y los maîtres.
 */
export async function chatAccess(viewer: Viewer, eventId: string, groupId: string | null = null) {
  const no = { read: false, write: false };
  const event = await db.event.findUnique({ where: { id: eventId }, select: { groupChats: true } });
  if (!event) return no;
  if (groupId && (!event.groupChats || !(await db.eventGroup.findFirst({ where: { id: groupId, eventId }, select: { id: true } })))) return no;
  if (viewer.kind === "admin") return { read: true, write: true };
  const a = await db.assignment.findUnique({
    where: { eventId_workerId: { eventId, workerId: viewer.id } },
    select: { status: true, role: true, groupId: true },
  });
  if (a?.status !== "CONFIRMADO") return no;
  const lead = isLeadRole(a.role);
  if (groupId) return a.groupId === groupId || (lead && !a.groupId) ? { read: true, write: true } : no;
  return { read: true, write: !event.groupChats || lead };
}

/** RRHH ve todos los chats; un trabajador solo el de los eventos en los que está confirmado. */
export async function canAccessChat(viewer: Viewer, eventId: string, groupId: string | null = null) {
  return (await chatAccess(viewer, eventId, groupId)).read;
}

export async function recentMessages(eventId: string, take = 200, groupId: string | null = null) {
  const rows = await db.message.findMany({ where: { eventId, groupId }, orderBy: { createdAt: "desc" }, take });
  return rows.reverse().map(toChatMessage);
}

/** Chats que ve cada uno en un evento con «chat por grupos»: el de avisos y el de su grupo (RRHH y quien dirige, todos). */
export async function visibleRooms(viewer: Viewer, eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { groupChats: true, groups: { select: { id: true, name: true }, orderBy: { position: "asc" } } },
  });
  if (!event?.groupChats) return [];
  if (viewer.kind === "admin") return event.groups;
  const a = await db.assignment.findUnique({ where: { eventId_workerId: { eventId, workerId: viewer.id } }, select: { role: true, groupId: true, status: true } });
  if (a?.status !== "CONFIRMADO") return [];
  if (a.groupId) return event.groups.filter((g) => g.id === a.groupId);
  return isLeadRole(a.role) ? event.groups : [];
}

export type Attachment = { fileId?: string; lat?: number; lng?: number };

export async function postMessage(viewer: Viewer, eventId: string, text: string, attachment: Attachment = {}, groupId: string | null = null) {
  const body = text.trim().slice(0, 2000);
  const hasLocation = attachment.lat != null && attachment.lng != null;
  if (!body && !attachment.fileId && !hasLocation) return null;
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const group = groupId ? await db.eventGroup.findUnique({ where: { id: groupId }, select: { name: true } }) : null;
  const message = await db.message.create({
    data: {
      eventId,
      groupId,
      body,
      fileId: attachment.fileId,
      lat: hasLocation ? attachment.lat : null,
      lng: hasLocation ? attachment.lng : null,
      workerId: viewer.kind === "worker" ? viewer.id : null,
      authorName: viewer.kind === "admin" ? `${viewer.name}${RRHH_SUFFIX}` : viewer.name,
    },
  });
  const payload = toChatMessage(message);
  bus.emit(chatChannel(eventId, groupId), payload);
  await markRead(viewer, eventId, message.createdAt, groupId);

  after(async () => {
    // Chat de un grupo: su gente y quien dirige el evento sin grupo; chat general: todo el personal confirmado
    const members = await db.assignment.findMany({
      where: { eventId, status: "CONFIRMADO", ...(groupId && { OR: [{ groupId }, { groupId: null, role: { in: [...LEAD_ROLES] } }] }) },
      select: { workerId: true },
    });
    for (const m of members) if (viewer.kind !== "worker" || m.workerId !== viewer.id) bus.emit(workerInbox(m.workerId), "chat");
    const preview = body
      ? body.length > 140 ? `${body.slice(0, 137)}…` : body
      : attachment.fileId ? "📷 Foto" : "📍 Ubicación";
    await notify({
      workerIds: members.map((m) => m.workerId).filter((id) => viewer.kind !== "worker" || id !== viewer.id),
      workerUrl: `/app/eventos/${eventId}`,
      admins: true,
      excludeAdmin: viewer.kind === "admin" ? viewer.name : undefined,
      adminUrl: `/admin/eventos/${eventId}/chat${groupId ? `?grupo=${groupId}` : ""}`,
      title: group ? `${event.name} · ${group.name}` : event.name,
      body: `${payload.authorName}: ${preview}`,
      tag: `chat-${eventId}${groupId ? `-${groupId}` : ""}`,
    });
  });
  return payload;
}

export async function markRead(viewer: Viewer, eventId: string, at = new Date(), groupId: string | null = null) {
  const reader = readerKey(viewer, groupId);
  await db.chatRead.upsert({
    where: { eventId_reader: { eventId, reader } },
    create: { eventId, reader, lastReadAt: at },
    update: { lastReadAt: at },
  });
  if (viewer.kind === "worker") bus.emit(workerInbox(viewer.id), "read");
}

/** Mensajes sin leer por evento para quien consulta (no cuenta los propios), sumando el chat general y los de sus grupos. */
export async function unreadCounts(viewer: Viewer, eventIds: string[]) {
  if (!eventIds.length) return new Map<string, number>();
  const reads = await db.chatRead.findMany({ where: { reader: { startsWith: readerKey(viewer) }, eventId: { in: eventIds } } });
  const lastRead = new Map(reads.map((r) => [`${r.eventId}|${r.reader}`, r.lastReadAt]));
  const notMine = viewer.kind === "admin" ? { workerId: { not: null } } : { OR: [{ workerId: null }, { workerId: { not: viewer.id } }] };
  const counts = await Promise.all(
    eventIds.map(async (eventId) => {
      const rooms: (string | null)[] = [null, ...(await visibleRooms(viewer, eventId)).map((g) => g.id)];
      const n = await Promise.all(
        rooms.map((groupId) =>
          db.message.count({
            where: { eventId, groupId, createdAt: { gt: lastRead.get(`${eventId}|${readerKey(viewer, groupId)}`) ?? new Date(0) }, ...notMine },
          }),
        ),
      );
      return n.reduce((a, b) => a + b, 0);
    }),
  );
  return new Map(eventIds.map((id, i) => [id, counts[i]]));
}

/** Chats de evento que ve el trabajador en «Chats»: los eventos en los que está confirmado desde hace una semana. */
export function workerChatEvents(workerId: string) {
  return db.event.findMany({
    where: { date: { gte: addDays(today(), -7) }, assignments: { some: { workerId, status: "CONFIRMADO" } } },
    // Último mensaje del chat general o del de su grupo (nunca el de otro grupo)
    include: { messages: { where: { OR: [{ groupId: null }, { group: { assignments: { some: { workerId } } } }] }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { date: "asc" },
  });
}
