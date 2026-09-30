import Link from "next/link";
import { notFound } from "next/navigation";
import { reopenIncident, reportIncidentAdmin, resolveIncident } from "@/app/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { IncidentForm } from "@/components/IncidentForm";
import { IncidentList } from "@/components/IncidentList";
import { LiveTeam } from "@/components/LiveTeam";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { liveTeam } from "@/lib/live";

export default async function AdminLive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await db.event.findUnique({ where: { id }, select: { id: true } }))) notFound();
  const [live, incidents] = await Promise.all([
    liveTeam(id),
    db.incident.findMany({
      where: { eventId: id },
      include: { reporter: { select: { name: true } }, worker: { select: { name: true } }, photos: { select: { id: true } } },
      orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <div>
        <Link href={`/admin/eventos/${id}`} className="text-sm text-stone-500 hover:underline">‹ {live.event.name}</Link>
        <h1>En directo · {live.event.name}</h1>
        <p className="text-sm text-stone-500 first-letter:uppercase">
          {formatDate(live.event.date, { long: true })} · {live.event.venue} · se actualiza cada 30 s
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <LiveTeam live={live} />
        <div className="space-y-4">
          <section className="space-y-2">
            <h2>Incidencias</h2>
            <IncidentList incidents={incidents} resolveAction={resolveIncident} reopenAction={reopenIncident} />
          </section>
          <IncidentForm action={reportIncidentAdmin.bind(null, id)} team={live.rows.map((r) => ({ id: r.workerId, name: r.name }))} />
        </div>
      </div>
    </div>
  );
}
