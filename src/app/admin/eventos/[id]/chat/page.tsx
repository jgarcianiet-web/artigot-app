import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { RoleBadge } from "@/components/ui";
import { recentMessages } from "@/lib/chat";
import { db } from "@/lib/db";
import { formatDate, ROLES } from "@/lib/domain";

export default async function AdminEventChat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    include: {
      assignments: { where: { status: "CONFIRMADO" }, include: { worker: true }, orderBy: { worker: { name: "asc" } } },
    },
  });
  if (!event) notFound();
  const members = [...event.assignments].sort((a, b) => ROLES.indexOf(a.role as never) - ROLES.indexOf(b.role as never));

  return (
    <div className="space-y-3">
      <div>
        <Link href={`/admin/eventos/${event.id}`} className="text-sm text-stone-500 hover:underline">‹ {event.name}</Link>
        <h1>Chat · {event.name}</h1>
        <p className="text-sm text-stone-500 first-letter:uppercase">
          {formatDate(event.date, { long: true })} · {event.venue}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Chat eventId={event.id} initial={await recentMessages(event.id)} me={{ workerId: null }} className="h-[calc(100dvh-14rem)] min-h-96" />
        <aside className="card h-fit space-y-2">
          <h2>Participantes ({members.length + 1})</h2>
          <p className="text-xs text-stone-500">RRHH y el personal confirmado. Quien rechaza o es cancelado deja de ver el chat.</p>
          <ul className="divide-y divide-stone-100 text-sm">
            <li className="py-1.5 font-medium text-brand-700">RRHH</li>
            {members.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                <Link href={`/admin/personal/${a.workerId}`} className="hover:underline">{a.worker.name}</Link>
                <RoleBadge role={a.role} />
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
