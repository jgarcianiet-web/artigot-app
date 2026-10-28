import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { EventInfo } from "@/components/EventInfo";
import { StatusBadge } from "@/components/ui";
import { requireWorker } from "@/lib/auth";
import { recentMessages, visibleRooms } from "@/lib/chat";
import { db } from "@/lib/db";
import { callTime, formatDate, isLeadRole, today } from "@/lib/domain";
import { reviewWindowOpen } from "@/lib/reviews";
import { Checklist } from "@/components/StaffForms";
import { checklistFor, getUniform } from "@/lib/staff";
import { respond } from "../../actions";
import { generalLead, GROUP_WITH_LEAD, groupLine } from "@/lib/groups";
import { WithdrawForm } from "./WithdrawForm";
import { canWithdrawFreely } from "@/lib/withdrawals";
import { acceptBlock, sameDayBookings } from "@/lib/convocation";
import { Transport } from "./Transport";

export default async function WorkerEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ chat?: string }> }) {
  const { id } = await params;
  const { chat } = await searchParams;
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
  const sameDay = canRespond ? await sameDayBookings(a) : [];
  // Eventos con grupos: el maître general (o, si es él, que supervisa todos los grupos)
  const isGeneral = !a.groupId && isLeadRole(a.role) && a.status === "CONFIRMADO" && (await db.eventGroup.count({ where: { eventId: a.eventId } })) > 0;
  const general = isGeneral ? "Eres el maître general del evento: supervisas todos los grupos." : a.group ? await generalLead(a.eventId) : null;

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
            {general && <span className="block text-sm">{general}</span>}
          </span>
          <StatusBadge status={a.status} />
        </summary>
        <div className="mt-3 space-y-3">
          <EventInfo event={a.event} role={a.role} group={a.group} general={general} />
          {blocked && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{blocked}</p>}
          {sameDay.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              ⚠ Ojo: ese día también estás en {sameDay.join(" y ")}. Comprueba que te da tiempo a los dos.
            </p>
          )}
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
          {a.status === "RECHAZADO" && a.withdrew && (
            <p className="rounded-lg bg-stone-100 p-2 text-sm text-stone-700">
              Has cancelado tu asistencia a este evento{a.withdrawReason ? ` (motivo: ${a.withdrawReason})` : ""}.
            </p>
          )}
          {canRespond && confirmed && a.withdrawRequestedAt && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              ⏳ Has pedido no ir («{a.withdrawReason}»). RRHH tiene que aprobarlo: hasta entonces sigues confirmado.
            </p>
          )}
          {canRespond && confirmed && !a.withdrawRequestedAt && <WithdrawForm assignmentId={a.id} free={canWithdrawFreely(a)} />}
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

      {confirmed && a.event.groupChats ? (
        // Evento grande: el chat de su grupo y el general de avisos (solo escriben RRHH y los maîtres)
        await (async () => {
          const rooms = await visibleRooms({ kind: "worker", id: me.id, name: me.name, role: me.role }, a.eventId);
          const room = rooms.find((r) => r.id === chat) ?? (chat === "avisos" ? undefined : rooms[0]);
          const tab = (key: string, label: string, on: boolean) => (
            <Link key={key} href={`/app/eventos/${a.eventId}?chat=${key}`} scroll={false} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${on ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"}`}>
              {label}
            </Link>
          );
          return (
            <div className="space-y-2">
              <div className="flex gap-2 overflow-x-auto">
                {rooms.map((r) => tab(r.id, `👥 ${rooms.length === 1 ? "Mi grupo · " : ""}${r.name}`, room?.id === r.id))}
                {tab("avisos", "📣 Avisos del evento", !room)}
              </div>
              <Chat
                key={room?.id ?? "avisos"}
                eventId={a.eventId}
                groupId={room?.id}
                initial={await recentMessages(a.eventId, 200, room?.id ?? null)}
                me={{ workerId: me.id }}
                className="h-[calc(100dvh-18rem)] min-h-80"
                emptyText={room ? `Chat del grupo ${room.name}: tu equipo y tu maître.` : "Aquí RRHH y los maîtres publican los avisos para todo el evento."}
                readOnlyText={!room && !isLeadRole(a.role) ? "Chat de avisos: solo escriben RRHH y los maîtres. Para hablar con tu equipo, usa el chat de tu grupo." : undefined}
              />
            </div>
          );
        })()
      ) : confirmed ? (
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
