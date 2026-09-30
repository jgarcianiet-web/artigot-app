import Link from "next/link";
import { Empty } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { unreadCounts } from "@/lib/chat";
import { db } from "@/lib/db";
import { addDays, formatDate, today } from "@/lib/domain";

export default async function AdminChats() {
  const name = await requireAdmin();
  const events = await db.event.findMany({
    where: { OR: [{ date: { gte: addDays(today(), -7) } }, { messages: { some: { createdAt: { gte: new Date(Date.now() - 7 * 864e5) } } } }] },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { assignments: { where: { status: "CONFIRMADO" } } } },
    },
    orderBy: { date: "asc" },
    take: 100,
  });
  const unread = await unreadCounts({ kind: "admin", name }, events.map((e) => e.id));
  // Primero los que tienen mensajes sin leer, luego por actividad reciente, luego por fecha
  const sorted = [...events].sort(
    (a, b) =>
      (unread.get(b.id) ?? 0) - (unread.get(a.id) ?? 0) ||
      (b.messages[0]?.createdAt.getTime() ?? 0) - (a.messages[0]?.createdAt.getTime() ?? 0) ||
      a.date.localeCompare(b.date),
  );

  return (
    <div className="space-y-4">
      <h1>Chats de eventos</h1>
      {sorted.length === 0 && <Empty>No hay eventos próximos.</Empty>}
      <ul className="card divide-y divide-stone-100 p-0">
        {sorted.map((e) => {
          const last = e.messages[0];
          const n = unread.get(e.id) ?? 0;
          return (
            <li key={e.id}>
              <Link href={`/admin/eventos/${e.id}/chat`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="shrink-0 text-xs text-stone-500">
                      {formatDate(e.date)} · {e._count.assignments} confirmados
                    </span>
                  </span>
                  <span className={`block truncate text-sm ${n ? "font-medium text-stone-800" : "text-stone-500"}`}>
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
