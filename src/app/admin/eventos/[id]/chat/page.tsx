import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { RoleBadge } from "@/components/ui";
import { recentMessages } from "@/lib/chat";
import { db } from "@/lib/db";
import { formatDate, ROLES } from "@/lib/domain";

export default async function AdminEventChat({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ grupo?: string }> }) {
  const { id } = await params;
  const { grupo } = await searchParams;
  const event = await db.event.findUnique({
    where: { id },
    include: {
      assignments: { where: { status: "CONFIRMADO" }, include: { worker: true }, orderBy: { worker: { name: "asc" } } },
      groups: { orderBy: { position: "asc" }, select: { id: true, name: true } },
    },
  });
  if (!event) notFound();
  // Evento con chat por grupos: el general (avisos) y uno por grupo
  const room = event.groupChats ? event.groups.find((g) => g.id === grupo) : undefined;
  const inRoom = (a: (typeof event.assignments)[number]) => !room || a.groupId === room.id || (!a.groupId && (a.role === "MAITRE" || a.role === "RESPONSABLE"));
  const members = event.assignments.filter(inRoom).sort((a, b) => ROLES.indexOf(a.role as never) - ROLES.indexOf(b.role as never));

  return (
    <div className="space-y-3">
      <div>
        <Link href={`/admin/eventos/${event.id}`} className="text-sm text-stone-500 hover:underline">‹ {event.name}</Link>
        <h1>Chat · {event.name}</h1>
        <p className="text-sm text-stone-500 first-letter:uppercase">
          {formatDate(event.date, { long: true })} · {event.venue}
        </p>
      </div>
      {event.groupChats && (
        <nav className="flex gap-2 overflow-x-auto" aria-label="Chats del evento">
          {[{ id: "", name: "📣 Avisos (todos)" }, ...event.groups.map((g) => ({ id: g.id, name: `👥 ${g.name}` }))].map((r) => (
            <Link
              key={r.id || "avisos"}
              href={`/admin/eventos/${event.id}/chat${r.id ? `?grupo=${r.id}` : ""}`}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${(room?.id ?? "") === r.id ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"}`}
            >
              {r.name}
            </Link>
          ))}
        </nav>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Chat
          key={room?.id ?? "general"}
          eventId={event.id}
          groupId={room?.id}
          initial={await recentMessages(event.id, 200, room?.id ?? null)}
          me={{ workerId: null }}
          className="h-[calc(100dvh-14rem)] min-h-96"
          emptyText={event.groupChats ? (room ? `Chat del grupo ${room.name}: su equipo, su maître y RRHH.` : "Avisos para todo el evento: solo escriben RRHH y los maîtres.") : undefined}
        />
        <aside className="card h-fit space-y-2">
          <h2>Participantes ({members.length + 1})</h2>
          <p className="text-xs text-stone-500">
            {event.groupChats
              ? room
                ? "RRHH, el grupo y los maîtres que dirigen todo el evento."
                : "Lo leen RRHH y todo el personal confirmado; escriben RRHH y los maîtres."
              : "RRHH y el personal confirmado. Quien rechaza o es cancelado deja de ver el chat."}
          </p>
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
