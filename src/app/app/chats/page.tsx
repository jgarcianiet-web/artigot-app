import Link from "next/link";
import { Empty } from "@/components/ui";
import { requireWorker } from "@/lib/auth";
import { unreadCounts, workerChatEvents } from "@/lib/chat";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { workerUnread } from "@/lib/workerChat";
import { workerGroups } from "@/lib/workerGroups";

export default async function WorkerChats() {
  const me = await requireWorker();
  const events = await workerChatEvents(me.id);
  const unread = await unreadCounts({ kind: "worker", id: me.id, name: me.name, role: me.role }, events.map((e) => e.id));
  const [rrhhUnread, rrhhLast, groups] = await Promise.all([
    workerUnread(me.id),
    db.workerMessage.findFirst({ where: { workerId: me.id }, orderBy: { createdAt: "desc" } }),
    workerGroups(me.id),
  ]);

  return (
    <div className="space-y-4">
      <h1>Chats</h1>
      {/* Chat directo con RRHH, siempre arriba */}
      <Link href="/app/rrhh" className="card flex items-center gap-3 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">RH</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">RRHH</span>
          <span className="block truncate text-sm text-stone-500">
            {rrhhLast ? `${rrhhLast.fromWorker ? "Tú" : rrhhLast.authorName.split(" ")[0]}: ${rrhhLast.body || "📷 Foto"}` : "Escribe a RRHH si necesitas algo"}
          </span>
        </span>
        {rrhhUnread > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">{rrhhUnread}</span>}
      </Link>
      {/* Grupos de RRHH con el personal */}
      {groups.length > 0 && (
        <ul className="card divide-y divide-stone-100 p-0">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/app/grupos/${g.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg" aria-hidden>👥</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{g.name}</span>
                  <span className="block truncate text-sm text-stone-500">{g.last ?? "Grupo de RRHH"}</span>
                </span>
                {g.unread > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">{g.unread}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {events.length === 0 && <Empty>Cuando aceptes una convocatoria aparecerá aquí el chat del evento.</Empty>}
      <ul className="card divide-y divide-stone-100 p-0">
        {events.map((e) => {
          const last = e.messages[0];
          const n = unread.get(e.id) ?? 0;
          return (
            <li key={e.id}>
              <Link href={`/app/eventos/${e.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="shrink-0 text-xs text-stone-500">{formatDate(e.date)}</span>
                  </span>
                  <span className="block truncate text-sm text-stone-500">
                    {last ? `${last.authorName}: ${last.body || (last.fileId ? "📷 Foto" : "📍 Ubicación")}` : "Sin mensajes todavía"}
                  </span>
                </span>
                {n > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">{n}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
