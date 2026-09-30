import Link from "next/link";
import { CoverageBar, Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { addDays, EVENT_TYPE_LABEL, formatDate, ROLE_PLURAL, today } from "@/lib/domain";
import { coverage } from "@/lib/staffing";
import { SwapApprovals } from "@/components/SwapApprovals";
import { DOC_LABEL, DOC_WARN_DAYS } from "@/lib/staff";

export default async function Dashboard() {
  const t = today();
  const [events, activeWorkers, pendingCount, openIncidents, swaps, docsToReview, docsExpiring] = await Promise.all([
    db.event.findMany({
      where: { date: { gte: t, lte: addDays(t, 30) }, status: "ABIERTO" },
      include: { assignments: { select: { role: true, status: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.worker.count({ where: { active: true } }),
    db.assignment.count({ where: { status: "CONVOCADO", event: { date: { gte: t } } } }),
    db.incident.count({ where: { resolved: false } }),
    db.swapRequest.findMany({
      where: { status: { in: ["PROPUESTO", "ACEPTADO"] }, event: { date: { gte: t } } },
      include: { event: { select: { id: true, name: true, date: true } }, fromWorker: { select: { name: true } }, toWorker: { select: { name: true } }, assignment: { select: { role: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    db.workerDocument.findMany({ where: { verified: false, worker: { active: true } }, include: { worker: { select: { id: true, name: true } } } }),
    db.workerDocument.findMany({
      where: { expiresAt: { not: null, lte: addDays(t, DOC_WARN_DAYS) }, worker: { active: true } },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { expiresAt: "asc" },
    }),
  ]);

  const rows = events.map((e) => {
    const cov = coverage(e, e.assignments);
    const need = cov.reduce((s, c) => s + c.need, 0);
    const confirmed = cov.reduce((s, c) => s + Math.min(c.confirmed, c.need), 0);
    return { event: e, cov, need, confirmed, complete: confirmed >= need };
  });
  const urgent = rows.filter((r) => !r.complete && r.event.date <= addDays(t, 7));

  const stats = [
    { label: "Eventos próximos 30 días", value: events.length },
    { label: "Con personal incompleto (7 días)", value: urgent.length, alert: urgent.length > 0 },
    { label: "Respuestas pendientes", value: pendingCount },
    { label: "Trabajadores activos", value: activeWorkers },
    { label: "Incidencias abiertas", value: openIncidents, alert: openIncidents > 0, href: "/admin/incidencias" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Panel</h1>
        <div className="flex gap-2">
          <Link href="/admin/personal/nuevo" className="btn">+ Trabajador</Link>
          <Link href="/admin/eventos/nuevo" className="btn btn-primary">+ Evento</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => {
          const body = (
            <>
              <div className={`text-3xl font-semibold ${s.alert ? "text-red-700" : ""}`}>{s.value}</div>
              <div className="text-sm text-stone-500">{s.label}</div>
            </>
          );
          const cls = `card block ${s.alert ? "border-red-300 bg-red-50" : ""}`;
          return "href" in s && s.href ? (
            <Link key={s.label} href={s.href} className={`${cls} hover:border-brand-600`}>{body}</Link>
          ) : (
            <div key={s.label} className={cls}>{body}</div>
          );
        })}
      </div>

      {swaps.length > 0 && (
        <section className="space-y-2">
          <h2>🔁 Cambios de turno</h2>
          <SwapApprovals swaps={swaps} />
        </section>
      )}

      {(docsToReview.length > 0 || docsExpiring.length > 0) && (
        <section className="space-y-2">
          <h2>📄 Documentación</h2>
          <ul className="card divide-y divide-stone-100 p-0 text-sm">
            {docsExpiring.map((d) => (
              <li key={d.id} className="flex justify-between gap-2 px-3 py-2">
                <Link href={`/admin/personal/${d.worker.id}`} className="link">{d.worker.name}</Link>
                <span className={d.expiresAt! < t ? "font-medium text-red-700" : "text-amber-700"}>
                  {DOC_LABEL[d.type]} {d.expiresAt! < t ? "caducado" : "caduca"} el {formatDate(d.expiresAt!)}
                </span>
              </li>
            ))}
            {docsToReview.map((d) => (
              <li key={d.id} className="flex justify-between gap-2 px-3 py-2">
                <Link href={`/admin/personal/${d.worker.id}`} className="link">{d.worker.name}</Link>
                <span className="text-stone-500">{DOC_LABEL[d.type]} pendiente de revisar</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2>Próximos eventos</h2>
        {rows.length === 0 && <Empty>No hay eventos en los próximos 30 días.</Empty>}
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(({ event: e, cov, need, confirmed, complete }) => (
            <Link key={e.id} href={`/admin/eventos/${e.id}`} className="card block transition hover:border-brand-600">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                    {formatDate(e.date)} · {e.startTime} · {EVENT_TYPE_LABEL[e.type]}
                  </div>
                  <div className="font-semibold">{e.name}</div>
                  <div className="text-sm text-stone-500">{e.venue}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    complete ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                  }`}
                >
                  {confirmed}/{need}
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                {cov.filter((c) => c.need > 0).map((c) => (
                  <div key={c.role} className="grid grid-cols-[6rem_1fr_4rem] items-center gap-2 text-xs">
                    <span className="text-stone-600">{ROLE_PLURAL[c.role]}</span>
                    <CoverageBar {...c} />
                    <span className="text-right text-stone-500">
                      {c.confirmed}/{c.need}
                      {c.pending > 0 && <span className="text-amber-600"> +{c.pending}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
