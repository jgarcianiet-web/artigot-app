import { after } from "next/server";
import { bus, workerInbox } from "./bus";
import { unreadCounts, workerChatEvents } from "./chat";
import { db } from "./db";
import { deleteStoredFile } from "./files";
import { notify } from "./push";
import { staffInbox, type StaffChatMessage, type StaffEvent } from "./staffChat";

/**
 * Chat directo entre RRHH y cada trabajador, tipo WhatsApp: una conversación por trabajador que comparte todo RRHH
 * (cualquiera de RRHH la ve y contesta). Al trabajador le salta el aviso en el móvil (o el email si no tiene la app
 * con avisos) y puede contestar; a RRHH le avisa cuando contesta. Tiempo real por SSE, fotos y «leído» (✓✓).
 *
 * Usa el mismo formato que el chat interno de RRHH (StaffChat): cada lado es un «miembro»: «rrhh» o «worker».
 */

export const RRHH = "rrhh";
export const WORKER = "worker";
export type DmSide = typeof RRHH | typeof WORKER;

export const dmChannel = (workerId: string) => `dm:${workerId}`;

type Row = { id: string; workerId: string; fromWorker: boolean; authorName: string; body: string; fileId: string | null; createdAt: Date };
const toMsg = (m: Row): StaffChatMessage => ({
  id: m.id, roomId: m.workerId, adminId: m.fromWorker ? WORKER : RRHH, authorName: m.authorName, body: m.body, fileId: m.fileId, createdAt: m.createdAt.toISOString(),
});

export async function dmMessages(workerId: string, take = 300) {
  const rows = await db.workerMessage.findMany({ where: { workerId }, orderBy: { createdAt: "desc" }, take });
  return rows.reverse().map(toMsg);
}

/** Hasta dónde ha leído cada lado (para los ✓✓). */
export async function dmReads(workerId: string) {
  const t = await db.workerThread.findUnique({ where: { workerId } });
  return { [RRHH]: t?.staffReadAt?.toISOString() ?? "", [WORKER]: t?.workerReadAt?.toISOString() ?? "" };
}

const preview = (body: string, fileId?: string) => (body ? (body.length > 140 ? `${body.slice(0, 137)}…` : body) : fileId ? "📷 Foto" : "");

/** Avisa a la lista de conversaciones de cada usuario de RRHH. */
async function pingAdmins() {
  const admins = await db.adminUser.findMany({ where: { active: true }, select: { id: true } });
  for (const a of admins) bus.emit(staffInbox(a.id), "dm");
}

export async function postDm(from: { side: DmSide; id: string; name: string }, workerId: string, text: string, fileId?: string) {
  const body = text.trim().slice(0, 4000);
  if (!body && !fileId) return null;
  const worker = await db.worker.findUnique({ where: { id: workerId }, select: { id: true, name: true } });
  if (!worker) return null;
  await db.workerThread.upsert({ where: { workerId }, create: { workerId }, update: {} });
  const fromWorker = from.side === WORKER;
  const m = await db.workerMessage.create({ data: { workerId, fromWorker, adminId: fromWorker ? null : from.id, authorName: from.name, body, fileId } });
  // Quien escribe ya lo ha leído todo hasta su mensaje
  await db.workerThread.update({ where: { workerId }, data: { lastMessageAt: m.createdAt, ...(fromWorker ? { workerReadAt: m.createdAt } : { staffReadAt: m.createdAt }) } });
  const msg = toMsg(m);
  bus.emit(dmChannel(workerId), { type: "message", message: msg } satisfies StaffEvent);
  bus.emit(dmChannel(workerId), { type: "read", adminId: from.side, at: msg.createdAt } satisfies StaffEvent);
  if (!fromWorker) bus.emit(workerInbox(workerId), "dm");
  after(async () => {
    await pingAdmins();
    if (fromWorker)
      await notify({ admins: true, adminUrl: `/admin/mensajes/personal/${workerId}`, title: `💬 ${worker.name}`, body: preview(body, fileId), tag: `dm-${workerId}` });
    else
      await notify({
        workerIds: [workerId],
        workerUrl: "/app/rrhh",
        title: "💬 Mensaje de RRHH",
        body: preview(body, fileId),
        tag: `dm-${workerId}`,
        emailFallback: true,
      });
  });
  return msg;
}

export async function markDmRead(side: DmSide, workerId: string) {
  const latest = await db.workerMessage.findFirst({ where: { workerId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!latest) return;
  const now = new Date();
  const at = latest.createdAt > now ? latest.createdAt : now;
  const field = side === WORKER ? "workerReadAt" : "staffReadAt";
  const r = await db.workerThread.updateMany({ where: { workerId, OR: [{ [field]: null }, { [field]: { lt: at } }] }, data: { [field]: at } });
  if (r.count) {
    bus.emit(dmChannel(workerId), { type: "read", adminId: side, at: at.toISOString() } satisfies StaffEvent);
    if (side === RRHH) await pingAdmins();
    else bus.emit(workerInbox(workerId), "read");
  }
}

/** Mensajes de RRHH que el trabajador aún no ha leído. */
export async function workerUnread(workerId: string) {
  const t = await db.workerThread.findUnique({ where: { workerId }, select: { workerReadAt: true } });
  return db.workerMessage.count({ where: { workerId, fromWorker: false, ...(t?.workerReadAt && { createdAt: { gt: t.workerReadAt } }) } });
}

/** Conversaciones con el personal (para RRHH), con el último mensaje y lo que han escrito sin leer. */
export async function staffThreads(take = 200) {
  const threads = await db.workerThread.findMany({
    orderBy: { lastMessageAt: "desc" },
    take,
    include: { worker: { select: { id: true, name: true, photoFileId: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return Promise.all(
    threads.map(async (t) => {
      const last = t.messages[0];
      const unread = await db.workerMessage.count({ where: { workerId: t.workerId, fromWorker: true, ...(t.staffReadAt && { createdAt: { gt: t.staffReadAt } }) } });
      return {
        workerId: t.workerId,
        name: t.worker.name,
        last: last ? { text: preview(last.body, last.fileId ?? undefined), author: last.fromWorker ? last.authorName.split(" ")[0] : `${last.authorName.split(" ")[0]} (RRHH)`, at: last.createdAt.toISOString() } : null,
        lastAt: t.lastMessageAt.toISOString(),
        unread,
      };
    }),
  );
}

/** Mensajes del personal sin leer por RRHH (para el número del menú). */
export async function staffDmUnread() {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "WorkerMessage" m JOIN "WorkerThread" t ON t."workerId" = m."workerId"
    WHERE m."fromWorker" AND (t."staffReadAt" IS NULL OR m."createdAt" > t."staffReadAt")`;
  return Number(rows[0]?.n ?? 0);
}

/** Elimina la conversación entera (mensajes y fotos) para todos: RRHH y el trabajador. */
export async function deleteDm(workerId: string) {
  const files = await db.workerMessage.findMany({ where: { workerId, fileId: { not: null } }, select: { fileId: true } });
  const { count } = await db.workerMessage.deleteMany({ where: { workerId } });
  await db.workerThread.deleteMany({ where: { workerId } });
  for (const f of files) await deleteStoredFile(f.fileId!);
  bus.emit(dmChannel(workerId), { type: "cleared" } satisfies StaffEvent);
  bus.emit(workerInbox(workerId), "cleared");
  await pingAdmins();
  return count;
}

/** Número de la pestaña «Chats» del trabajador: cuántos chats (RRHH y eventos) tienen mensajes sin leer. */
export async function unreadChats(me: { id: string; name: string; role: string }) {
  const events = await workerChatEvents(me.id);
  const [dm, counts] = await Promise.all([
    workerUnread(me.id),
    unreadCounts({ kind: "worker", id: me.id, name: me.name, role: me.role }, events.map((e) => e.id)),
  ]);
  return (dm > 0 ? 1 : 0) + [...counts.values()].filter((n) => n > 0).length;
}
