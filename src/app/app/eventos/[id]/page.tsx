import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { EventInfo } from "@/components/EventInfo";
import { StatusBadge } from "@/components/ui";
import { requireWorker } from "@/lib/auth";
import { recentMessages } from "@/lib/chat";
import { db } from "@/lib/db";
import { callTime, formatDate, isLeadRole, today } from "@/lib/domain";
import { reviewWindowOpen } from "@/lib/reviews";
import { Checklist } from "@/components/StaffForms";
import { checklistFor, getUniform } from "@/lib/staff";
import { respond } from "../../actions";
import { GROUP_WITH_LEAD, groupLine } from "@/lib/groups";
import { acceptBlock } from "@/lib/convocation";
import { Transport } from "./Transport";

export default async function WorkerEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireWorker();
  const a = await db.assignment.findUnique({
    where: { eventId_workerId: { eventId: id, workerId: me.id } },
    include: { event: { include: { savedVenue: { select: { accessNotes: true } } } }, group: GROUP_WITH_LEAD },
  });
  if (!a) notFound();
  const confirmed = a.status === "CONFIRMADO";
  const checklist = checklistFor(await getUniform(), a.role, a.event.checklist);
  const canRespond = a.event.date >= today() && !a.checkIn && (a.status === "CONVOCADO" || confirmed);
  const blocked = canRespond && a.status === "CONVOCADO" ? await acceptBlock(a) : null;

  return (
    <div className="space-y-4">
      <Link href="/app" className="text-sm text-stone-500">‹ Volver</Link>
      <details className="card" open={!confirmed}>
        <summary className="flex cursor-pointer items-center justify-between gap-2">
          <span>
            <span className="block font-semibold">{a.event.name}</span>
            <span className="text-sm text-stone-500 first-letter:uppercase">
              {formatDate(a.event.date)} · citación {callTime(a.event, a.role, a.group)} · {a.event.venue}
            </span>
            {a.group && <span className="block text-sm font-medium">{groupLine(a.group, a.event.startTime, a.role)}</span>}
          </span>
          <StatusBadge status={a.status} />
        </summary>
        <div className="mt-3 space-y-3">
          <EventInfo event={a.event} role={a.role} group={a.group} />
          {blocked && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{blocked}</p>}
          {canRespond && a.status === "CONVOCADO" && (
            <div className="grid grid-cols-2 gap-2">
              <form action={respond.bind(null, a.id, true)}>
                <button className="btn btn-success w-full py-3" disabled={!!blocked}>Acepto</button>
              </form>
              <form action={respond.bind(null, a.id, false)}>
                <button className="btn btn-danger w-full py-3">No puedo</button>
              </form>
            </div>
          )}
          {canRespond && confirmed && (
            <div className="flex flex-wrap gap-2">
              <form action={respond.bind(null, a.id, false)}>
                <button className="btn btn-danger btn-sm">Ya no puedo ir</button>
              </form>
            </div>
          )}
        </div>
      </details>

      {confirmed && <Checklist id={a.id} {...checklist} extra={checklist.event} />}

      {confirmed && (
        <Transport assignmentId={a.id} eventId={a.eventId} meetingPoint={a.event.meetingPoint} meetingTime={a.event.meetingTime} editable={a.event.date >= today() && !a.checkIn} />
      )}

      {confirmed && isLeadRole(a.role) && a.event.date <= today() && (
        <Link href={`/app/eventos/${a.eventId}/equipo`} className="btn w-full">👥 Panel del equipo e incidencias</Link>
      )}
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
