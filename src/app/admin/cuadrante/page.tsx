import Link from "next/link";
import { RoleBadge } from "@/components/ui";
import { addDays, euro, today } from "@/lib/domain";
import { syncAutoEmployments } from "@/lib/autoAltas";
import { dayLabel, weekLabel, weekSchedule, weekStart, type ScheduleStaff } from "@/lib/schedule";

const SS: Record<NonNullable<ScheduleStaff["ss"]>, { label: string; title: string; cls: string }> = {
  ALTA: { label: "A", title: "Alta en la Seguridad Social este día (sigue mañana)", cls: "bg-emerald-600 text-white" },
  ALTA_BAJA: { label: "A·B", title: "Alta y baja este día (solo trabaja hoy)", cls: "bg-amber-500 text-white" },
  CONTINUA: { label: "S", title: "Sigue de alta (trabajó ayer y trabaja mañana)", cls: "bg-sky-600 text-white" },
  BAJA: { label: "B", title: "Baja este día (no trabaja mañana)", cls: "bg-red-600 text-white" },
};

/** Cuadrante semanal de RRHH: quién va a cada evento, con su horario y su importe, y el recuento de fijos. */
export default async function Schedule({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const sp = await searchParams;
  const t = today();
  const monday = weekStart(sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) ? sp.semana : t);
  // Las altas y bajas se recalculan con lo confirmado antes de enseñarlas
  await syncAutoEmployments().catch((e) => console.error("altas automáticas", e));
  const s = await weekSchedule(monday);
  const total = s.days.reduce((a, d) => a + d.events.reduce((b, e) => b + e.total, 0), 0);
  const people = new Set(s.days.flatMap((d) => d.events.flatMap((e) => e.staff.map((p) => p.workerId)))).size;
  const services = s.days.reduce((a, d) => a + d.events.reduce((b, e) => b + e.staff.length, 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto">Cuadrante</h1>
        <Link href={`/admin/cuadrante?semana=${addDays(monday, -7)}`} className="btn" aria-label="Semana anterior">‹</Link>
        <span className="min-w-44 text-center font-semibold">{weekLabel(monday)}</span>
        <Link href={`/admin/cuadrante?semana=${addDays(monday, 7)}`} className="btn" aria-label="Semana siguiente">›</Link>
        {weekStart(t) !== monday && <Link href="/admin/cuadrante" className="btn btn-sm">Esta semana</Link>}
        <a href={`/admin/cuadrante/excel?semana=${monday}`} className="btn btn-primary">⬇ Excel</a>
      </div>
      <p className="text-sm text-stone-500">
        Con «+ Borrador» preparas un evento y su personal sin avisar a nadie; al confirmarlo se crea en Eventos y se manda la convocatoria. <span className="italic text-stone-400">En gris</span> quien aún no ha confirmado; <span className="rounded bg-sky-100 px-1 text-sky-800">F</span> los fijos. Seguridad Social de los extras confirmados (se calcula sola):{" "}
        <span className="rounded bg-emerald-600 px-1 text-white">A</span> alta, <span className="rounded bg-sky-600 px-1 text-white">S</span> sigue, <span className="rounded bg-red-600 px-1 text-white">B</span> baja.
      </p>
      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="card p-3"><div className="text-2xl font-semibold">{services}</div><div className="text-xs text-stone-500">Servicios</div></div>
        <div className="card p-3"><div className="text-2xl font-semibold">{people}</div><div className="text-xs text-stone-500">Personas</div></div>
        <div className="card p-3"><div className="text-2xl font-semibold">{euro(total)}</div><div className="text-xs text-stone-500">Coste de personal</div></div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1100px] grid-cols-7 gap-2">
          {s.days.map((d) => (
            <section key={d.date} className="min-w-0 space-y-2">
              <h2 className={`rounded-md px-2 py-1 text-center text-xs font-semibold tracking-wide ${d.date === t ? "bg-brand-600 text-white" : "bg-stone-800 text-white"}`}>{dayLabel(d.date)}</h2>
              {(d.ss.altas > 0 || d.ss.bajas > 0) && (
                <Link href={`/admin/altas?dia=${d.date}`} className="block rounded-md bg-stone-100 px-1 py-0.5 text-center text-[11px] text-stone-700 hover:bg-stone-200" title="Ver y descargar los Excel de altas y bajas de este día">
                  S. Social: <span className="text-emerald-700">{d.ss.altas} A</span> · <span className="text-red-700">{d.ss.bajas} B</span> ›
                </Link>
              )}
              {d.date >= t && (
                <Link href={`/admin/cuadrante/borrador/nuevo?fecha=${d.date}`} className="block rounded-md border border-dashed border-stone-300 py-1 text-center text-xs text-stone-500 hover:border-stone-500 hover:text-stone-800">
                  + Borrador
                </Link>
              )}
              {d.events.length === 0 && <p className="py-2 text-center text-xs text-stone-400">—</p>}
              {d.events.map((e) => (
                <article key={e.id} className={`card space-y-1 p-2 ${e.status === "CANCELADO" ? "opacity-50" : ""} ${e.draft ? "border-2 border-dashed border-amber-400 bg-amber-50/40" : ""}`}>
                  {e.draft && <p className="text-center text-[10px] font-semibold tracking-wide text-amber-700">BORRADOR</p>}
                  <Link href={e.draft ? `/admin/cuadrante/borrador/${e.id}` : `/admin/eventos/${e.id}`} className={`block rounded px-1.5 py-1 text-center text-xs font-semibold uppercase ${e.draft ? "bg-white text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100" : "bg-amber-100 text-amber-950 hover:bg-amber-200"}`}>
                    {e.name}
                  </Link>
                  <p className="truncate text-[11px] text-stone-500" title={e.venue}>{e.time}{e.venue && ` · ${e.venue}`}</p>
                  <p className={`text-[11px] ${e.confirmed < e.needed ? "font-medium text-red-700" : "text-emerald-700"}`}>{e.confirmed}/{e.needed} {e.draft ? "previstos" : "confirmados"}</p>
                  {e.draft && (
                    <Link href={`/admin/cuadrante/borrador/${e.id}`} className="block rounded bg-amber-500 py-0.5 text-center text-[11px] font-medium text-white hover:bg-amber-600">
                      Editar · confirmar
                    </Link>
                  )}
                  <ol className="divide-y divide-stone-100 text-xs">
                    {e.staff.map((p, i) => (
                      <li key={p.assignmentId} className={`flex items-baseline gap-1 py-0.5 ${p.status === "CONVOCADO" ? "italic text-stone-400" : ""}`} title={`${p.name} · ${p.time}${p.status === "CONVOCADO" ? " · pendiente de confirmar" : ""}`}>
                        <span className="w-4 shrink-0 text-right text-[10px] text-stone-400">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/admin/personal/${p.workerId}`} className="block truncate hover:underline">
                            {p.fixed && <span className="mr-0.5 rounded bg-sky-100 px-0.5 text-[9px] font-semibold text-sky-800 not-italic">F</span>}
                            {p.name}
                          </Link>
                          <span className="flex items-center gap-1 text-[10px] text-stone-500">
                            {p.role !== "CAMARERO" && <RoleBadge role={p.role} />}
                            <span className={p.clocked ? "text-emerald-700" : ""}>{p.time}</span>
                          </span>
                        </span>
                        {p.ss && <span className={`shrink-0 rounded px-1 text-[9px] font-bold not-italic ${SS[p.ss].cls}`} title={SS[p.ss].title}>{SS[p.ss].label}</span>}
                        <span className="shrink-0 tabular-nums">{Math.round(p.amount)}</span>
                      </li>
                    ))}
                  </ol>
                  {e.staff.length > 0 && <p className="border-t border-stone-200 pt-1 text-right text-[11px] font-medium">{euro(e.total)}</p>}
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>

      {s.fixed.length > 0 && (
        <section className="space-y-2">
          <h2>Recuento de fijos <span className="text-sm font-normal text-stone-500">· «Mes» = {new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(new Date(`${s.sunday}T12:00:00Z`))} hasta el {Number(s.sunday.slice(8))}</span></h2>
          <div className="card overflow-x-auto p-0 sm:max-w-2xl">
            <table className="table text-sm">
              <thead><tr><th>Fijo</th><th className="text-right">Esta semana</th><th className="text-right">Mes</th><th className="text-right">Nómina</th><th className="text-right">Resta</th></tr></thead>
              <tbody>
                {s.fixed.map((w) => (
                  <tr key={w.id}>
                    <td><Link href={`/admin/personal/${w.id}`} className="link">{w.name}</Link>{!w.clocks && <span className="ml-1 text-xs text-stone-500">(no ficha)</span>}</td>
                    <td className="text-right tabular-nums">{euro(w.week)}</td>
                    <td className="text-right tabular-nums">{euro(w.value)}</td>
                    <td className="text-right tabular-nums">{w.salary != null ? euro(w.salary) : "—"}</td>
                    <td className={`text-right tabular-nums ${w.left != null && w.left < 0 ? "font-semibold text-emerald-700" : ""}`}>
                      {w.left == null ? "—" : w.left < 0 ? `+${euro(-w.left)} a pagar` : euro(w.left)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
