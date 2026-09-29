import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { EventInfo } from "@/components/EventInfo";
import { StatusBadge } from "@/components/ui";
import { requireWorker } from "@/lib/auth";
import { recentMessages } from "@/lib/chat";
import { db } from "@/lib/db";
import { isLeadRole, today } from "@/lib/domain";
import { reviewWindowOpen } from "@/lib/reviews";
import { respond } from "../../actions";

export default async function WorkerEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireWorker();
  const a = await db.assignment.findUnique({
    where: { eventId_workerId: { eventId: id, workerId: me.id } },
    include: { event: true },
  });
  if (!a) notFound();
  const confirmed = a.status === "CONFIRMADO";
  const canRespond = a.event.date >= today() && !a.checkIn && (a.status === "CONVOCADO" || confirmed);

  return (
    <div className="space-y-4">
      <Link href="/app" className="text-sm text-stone-500">‹ Volver</Link>
      <details className="card" open={!confirmed}>
        <summary className="flex cursor-pointer items-center justify-between gap-2">
          <span className="font-semibold">{a.event.name}</span>
          <StatusBadge status={a.status} />
        </summary>
        <div className="mt-3 space-y-3">
          <EventInfo event={a.event} role={a.role} />
          {canRespond && a.status === "CONVOCADO" && (
            <div className="grid grid-cols-2 gap-2">
              <form action={respond.bind(null, a.id, true)}>
                <button className="btn btn-success w-full py-3">Acepto</button>
              </form>
              <form action={respond.bind(null, a.id, false)}>
                <button className="btn btn-danger w-full py-3">No puedo</button>
              </form>
            </div>
          )}
          {canRespond && confirmed && (
            <form action={respond.bind(null, a.id, false)}>
              <button className="btn btn-danger btn-sm">Ya no puedo ir</button>
            </form>
          )}
        </div>
      </details>

      {confirmed && isLeadRole(a.role) && reviewWindowOpen(a.event) && (
        <Link href={`/app/eventos/${a.eventId}/valorar`} className="btn btn-primary w-full">⭐ Valorar a mi equipo</Link>
      )}

      {confirmed ? (
        <Chat
          eventId={a.eventId}
          initial={await recentMessages(a.eventId)}
          me={{ workerId: me.id }}
          className="h-[calc(100dvh-16rem)] min-h-80"
        />
      ) : (
        <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">
          El chat del evento está disponible para el personal confirmado.
        </p>
      )}
    </div>
  );
}
