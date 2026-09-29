import Link from "next/link";
import { Empty } from "@/components/ui";
import { requireWorker } from "@/lib/auth";
import { unreadCounts } from "@/lib/chat";
import { db } from "@/lib/db";
import { addDays, formatDate, today } from "@/lib/domain";

export default async function WorkerChats() {
  const me = await requireWorker();
  const events = await db.event.findMany({
    where: {
      date: { gte: addDays(today(), -7) },
      assignments: { some: { workerId: me.id, status: "CONFIRMADO" } },
    },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { date: "asc" },
  });
  const unread = await unreadCounts({ kind: "worker", id: me.id, name: me.name, role: me.role }, events.map((e) => e.id));

  return (
    <div className="space-y-4">
      <h1>Chats</h1>
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
                    {last ? `${last.authorName}: ${last.body}` : "Sin mensajes todavía"}
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
