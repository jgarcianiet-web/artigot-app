import Link from "next/link";
import { MonthlyBars } from "@/components/MonthlyBars";
import { Empty } from "@/components/ui";
import { euro, formatDate, num, today } from "@/lib/domain";
import { monthRange } from "@/lib/payroll";
import { buildReport } from "@/lib/reports";

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)} %`);
const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");

export default async function Reports({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const sp = await searchParams;
  const def = monthRange(today());
  const from = isDate(sp.desde) ? sp.desde! : def.from;
  const to = isDate(sp.hasta) ? sp.hasta! : def.to;
  const r = await buildReport(from, to);
  const qs = `desde=${from}&hasta=${to}`;

  const kpis = [
    { label: "Eventos", value: String(r.kpis.events) },
    { label: "Servicios", value: String(r.kpis.services) },
    { label: "Horas", value: num(r.kpis.hours) },
    { label: "Coste de personal", value: euro(r.kpis.cost) },
    { label: "Aceptan la convocatoria", value: pct(r.kpis.acceptRate) },
    { label: "Tiempo medio de respuesta", value: r.kpis.avgResponseH == null ? "—" : `${fmt1(r.kpis.avgResponseH)} h` },
    { label: "Incidencias", value: String(r.kpis.incidents) },
  ];

  return (
    <div className="space-y-5">
      <h1>Informes</h1>
      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="desde">Desde</label>
          <input id="desde" type="date" name="desde" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Hasta</label>
          <input id="hasta" type="date" name="hasta" defaultValue={to} className="input" />
        </div>
        <button className="btn">Ver</button>
        <a href={`/admin/informes/exportar?${qs}`} className="btn ml-auto">Exportar a Excel</a>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {kpis.map((k) => (
          <div key={k.label} className="card p-3">
            <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
            <div className="text-xs text-stone-500">{k.label}</div>
          </div>
        ))}
      </div>

      <MonthlyBars
        title="Coste de personal por mes (últimos 12 meses)"
        points={r.trend.map((t) => ({ key: t.key, label: t.label, value: t.cost, detail: `${t.services} servicios` }))}
      />

      <section className="space-y-2">
        <h2>Por evento</h2>
        {r.byEvent.length === 0 ? (
          <Empty>No hay eventos en este periodo.</Empty>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Evento</th>
                  <th>Cliente</th>
                  <th className="text-right">Personal</th>
                  <th className="text-right">Horas</th>
                  <th className="text-right">Coste</th>
                  <th className="text-right">Incidencias</th>
                </tr>
              </thead>
              <tbody>
                {r.byEvent.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{formatDate(e.date)}</td>
                    <td>
                      <Link href={`/admin/eventos/${e.id}`} className="link">{e.name}</Link>
                      {e.missingHours > 0 && <span className="ml-2 text-xs text-amber-700">{e.missingHours} sin horas</span>}
                    </td>
                    <td className="text-stone-500">{e.client}</td>
                    <td className="text-right tabular-nums">{e.staff}</td>
                    <td className="text-right tabular-nums">{num(e.hours)}</td>
                    <td className="text-right tabular-nums">{euro(e.cost)}</td>
                    <td className="text-right tabular-nums">{e._count.incidents || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2>Por trabajador</h2>
        {r.workers.length === 0 ? (
          <Empty>Sin actividad en este periodo.</Empty>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th className="text-right">Servicios</th>
                  <th className="text-right">Horas</th>
                  <th className="text-right">Importe</th>
                  <th className="text-right">Valoración media</th>
                  <th className="text-right">Rechazos</th>
                  <th className="text-right">Retiradas</th>
                  <th className="text-right">Retrasos</th>
                  <th className="text-right">Ausencias</th>
                </tr>
              </thead>
              <tbody>
                {r.workers.map((w) => (
                  <tr key={w.workerId}>
                    <td><Link href={`/admin/personal/${w.workerId}`} className="link">{w.name}</Link></td>
                    <td className="text-right tabular-nums">{w.services}</td>
                    <td className="text-right tabular-nums">{num(w.hours)}</td>
                    <td className="text-right tabular-nums">{euro(w.cost)}</td>
                    <td className="text-right tabular-nums">{w.avgReview == null ? "—" : `${fmt1(w.avgReview)} / 5`}</td>
                    <td className="text-right tabular-nums">{w.rejected || ""}</td>
                    <td className="text-right tabular-nums">{w.withdrawals || ""}</td>
                    <td className="text-right tabular-nums">{w.lates || ""}</td>
                    <td className={`text-right tabular-nums ${w.noShows ? "font-semibold text-red-700" : ""}`}>{w.noShows || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {r.incidents.length > 0 && (
        <section className="space-y-2">
          <h2>Incidencias por tipo</h2>
          <div className="card max-w-md p-0">
            <table className="table">
              <tbody>
                {r.incidents.map((i) => (
                  <tr key={i.type}>
                    <td>{i.label}</td>
                    <td className="text-right tabular-nums">{i.count}</td>
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
