import { after } from "next/server";
import type { Viewer } from "./auth";
import { bus, chatChannel } from "./bus";
import { db } from "./db";
import { notify } from "./push";

export const ADMIN_READER = "rrhh";
const RRHH_SUFFIX = " (RRHH)";
export const readerKey = (v: Viewer) => (v.kind === "admin" ? ADMIN_READER : `w:${v.id}`);

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

/** RRHH ve todos los chats; un trabajador solo el de los eventos en los que está confirmado. */
export async function canAccessChat(viewer: Viewer, eventId: string) {
  if (viewer.kind === "admin") return true;
  const a = await db.assignment.findUnique({
    where: { eventId_workerId: { eventId, workerId: viewer.id } },
    select: { status: true },
  });
  return a?.status === "CONFIRMADO";
}

export async function recentMessages(eventId: string, take = 200) {
  const rows = await db.message.findMany({ where: { eventId }, orderBy: { createdAt: "desc" }, take });
  return rows.reverse().map(toChatMessage);
}

export type Attachment = { fileId?: string; lat?: number; lng?: number };

export async function postMessage(viewer: Viewer, eventId: string, text: string, attachment: Attachment = {}) {
  const body = text.trim().slice(0, 2000);
  const hasLocation = attachment.lat != null && attachment.lng != null;
  if (!body && !attachment.fileId && !hasLocation) return null;
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const message = await db.message.create({
    data: {
      eventId,
      body,
      fileId: attachment.fileId,
      lat: hasLocation ? attachment.lat : null,
      lng: hasLocation ? attachment.lng : null,
      workerId: viewer.kind === "worker" ? viewer.id : null,
      authorName: viewer.kind === "admin" ? `${viewer.name}${RRHH_SUFFIX}` : viewer.name,
    },
  });
  const payload = toChatMessage(message);
  bus.emit(chatChannel(eventId), payload);
  await markRead(viewer, eventId, message.createdAt);

  after(async () => {
    const members = await db.assignment.findMany({
      where: { eventId, status: "CONFIRMADO" },
      select: { workerId: true },
    });
    const preview = body
      ? body.length > 140 ? `${body.slice(0, 137)}…` : body
      : attachment.fileId ? "📷 Foto" : "📍 Ubicación";
    await notify({
      workerIds: members.map((m) => m.workerId).filter((id) => viewer.kind !== "worker" || id !== viewer.id),
      workerUrl: `/app/eventos/${eventId}`,
      admins: true,
      excludeAdmin: viewer.kind === "admin" ? viewer.name : undefined,
      adminUrl: `/admin/eventos/${eventId}/chat`,
      title: event.name,
      body: `${payload.authorName}: ${preview}`,
      tag: `chat-${eventId}`,
    });
  });
  return payload;
}

export async function markRead(viewer: Viewer, eventId: string, at = new Date()) {
  const reader = readerKey(viewer);
  await db.chatRead.upsert({
    where: { eventId_reader: { eventId, reader } },
    create: { eventId, reader, lastReadAt: at },
    update: { lastReadAt: at },
  });
}

/** Mensajes sin leer por evento para quien consulta (no cuenta los propios). */
export async function unreadCounts(viewer: Viewer, eventIds: string[]) {
  if (!eventIds.length) return new Map<string, number>();
  const reader = readerKey(viewer);
  const reads = await db.chatRead.findMany({ where: { reader, eventId: { in: eventIds } } });
  const lastRead = new Map(reads.map((r) => [r.eventId, r.lastReadAt]));
  const counts = await Promise.all(
    eventIds.map((eventId) =>
      db.message.count({
        where: {
          eventId,
          createdAt: { gt: lastRead.get(eventId) ?? new Date(0) },
          ...(viewer.kind === "admin"
            ? { workerId: { not: null } }
            : { OR: [{ workerId: null }, { workerId: { not: viewer.id } }] }),
        },
      }),
    ),
  );
  return new Map(eventIds.map((id, i) => [id, counts[i]]));
}
