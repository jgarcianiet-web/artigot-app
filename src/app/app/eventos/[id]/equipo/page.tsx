import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { IncidentForm } from "@/components/IncidentForm";
import { IncidentList } from "@/components/IncidentList";
import { LiveTeam } from "@/components/LiveTeam";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { liveTeam } from "@/lib/live";
import { isEventLead } from "@/lib/reviews";
import { markArrival, reportIncident } from "../../../actions";

/** Panel del maître / camarero responsable durante el evento. */
export default async function LeadPanel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireWorker();
  if (!(await isEventLead(id, me.id))) notFound();
  const [live, incidents] = await Promise.all([
    liveTeam(id),
    db.incident.findMany({
      where: { eventId: id },
      include: { reporter: { select: { name: true } }, worker: { select: { name: true } }, photos: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const team = live.rows.filter((r) => r.workerId !== me.id).map((r) => ({ id: r.workerId, name: r.name }));

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <Link href={`/app/eventos/${id}`} className="text-sm text-stone-500">‹ Evento y chat</Link>
      <div>
        <h1>Equipo en directo</h1>
        <p className="text-sm text-stone-500">{live.event.name} · {formatDate(live.event.date)} · se actualiza solo</p>
      </div>
      <LiveTeam live={live} markAction={markArrival} />
      <IncidentForm action={reportIncident.bind(null, id)} team={team} />
      <section className="space-y-2">
        <h2>Incidencias del evento</h2>
        <IncidentList incidents={incidents} />
      </section>
    </div>
  );
}
