import Link from "next/link";
import { CoverageBar, Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { addDays, EVENT_TYPE_LABEL, formatDate, ROLE_PLURAL, today } from "@/lib/domain";
import { coverage } from "@/lib/staffing";
import { DOC_LABEL, DOC_WARN_DAYS } from "@/lib/staff";
import { todayTasks } from "@/lib/todayTasks";
import { syncAutoEmployments } from "@/lib/autoAltas";
import { incompleteWorkers } from "@/lib/completeness";

export default async function Dashboard() {
  const t = today();
  await syncAutoEmployments();
  const [events, activeWorkers, pendingCount, docsToReview, docsExpiring] = await Promise.all([
    db.event.findMany({
      where: { date: { gte: t, lte: addDays(t, 30) }, status: "ABIERTO" },
      include: { assignments: { select: { role: true, status: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.worker.count({ where: { active: true } }),
    db.assignment.count({ where: { status: "CONVOCADO", event: { date: { gte: t } } } }),
    db.workerDocument.findMany({ where: { verified: false, worker: { active: true } }, include: { worker: { select: { id: true, name: true } } } }),
    db.workerDocument.findMany({
      where: { expiresAt: { not: null, lte: addDays(t, DOC_WARN_DAYS) }, worker: { active: true } },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { expiresAt: "asc" },
    }),
  ]);

  const [tasks, incomplete, docsPending] = await Promise.all([
    todayTasks(t),
    incompleteWorkers(),
    db.workerDocument.count({ where: { verified: false, worker: { active: true } } }),
  ]);
  const incompleteSoon = incomplete.filter((w) => w.upcoming);
  const rows = events.map((e) => {
    const cov = coverage(e, e.assignments);
    const need = cov.reduce((s, c) => s + c.need, 0);
    const confirmed = cov.reduce((s, c) => s + Math.min(c.confirmed, c.need), 0);
    return { event: e, cov, need, confirmed, complete: confirmed >= need };
  });
  const urgent = rows.filter((r) => !r.complete && r.event.date <= addDays(t, 7));

  // Lo que hay que hacer ya está en «Tareas de hoy»; aquí solo las cifras generales, cada una con su enlace
  const stats = [
    { label: "Eventos en los próximos 30 días", value: events.length, href: "/admin/eventos" },
    { label: "Eventos sin cubrir en 7 días", value: urgent.length, alert: urgent.length > 0, href: "/admin/calendario" },
    { label: "Convocados esperando respuesta", value: pendingCount, href: "/admin/calendario" },
    { label: "Trabajadores activos", value: activeWorkers, href: "/admin/personal" },
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

      <section className="space-y-2">
        <h2>✅ Tareas de hoy</h2>
        {tasks.length === 0 ? (
          <p className="card text-sm text-emerald-800">Todo al día. No hay nada pendiente.</p>
        ) : (
          <ul className="card divide-y divide-stone-100 p-0">
            {tasks.map((x) => (
              <li key={x.key}>
                <Link href={x.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50">
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${x.urgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{x.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{x.text}</span>
                    {x.detail && <span className="block truncate text-xs text-stone-500">{x.detail}</span>}
                  </span>
                  <span className="text-stone-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={`card block py-3 hover:border-brand-600 ${s.alert ? "border-red-300 bg-red-50" : ""}`}>
            <div className={`text-2xl font-semibold ${s.alert ? "text-red-700" : ""}`}>{s.value}</div>
            <div className="text-sm text-stone-500">{s.label}</div>
          </Link>
        ))}
      </div>

      {(incomplete.length > 0 || docsPending > 0) && (
        <section className="space-y-2">
          <h2>🪪 Datos y documentos</h2>
          <div className={`card space-y-1 text-sm ${incompleteSoon.length ? "border-red-300 bg-red-50" : ""}`}>
            {docsPending > 0 && (
              <p><Link href="/admin/documentos" className="link font-medium">{docsPending} {docsPending === 1 ? "documento" : "documentos"} por revisar</Link>.</p>
            )}
            {incomplete.length > 0 && (
              <p>
                <Link href="/admin/personal?incompletos=1" className="link">{incomplete.length} {incomplete.length === 1 ? "persona" : "personas"} con datos o documentos incompletos</Link>
                {incompleteSoon.length > 0 && <span className="font-medium text-red-700">, {incompleteSoon.length} con servicio en los próximos 7 días: {incompleteSoon.map((w) => w.name).join(", ")}</span>}
                . Se les recuerda automáticamente.
              </p>
            )}
          </div>
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
