import Link from "next/link";
import { Empty } from "@/components/ui";
import { budgetRows, bySalesRep, pctText, salesReps, totals } from "@/lib/budget";
import { euro, formatDate } from "@/lib/domain";
import { budgetFilters } from "./filters";

const devClass = (d: number | null) => (d == null ? "" : d > 0 ? "text-red-700" : d < 0 ? "text-emerald-700" : "");
const signed = (d: number | null) => (d == null ? "—" : `${d > 0 ? "+" : ""}${euro(d)}`);

export default async function Budgets({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; comercial?: string }> }) {
  const f = budgetFilters(await searchParams);
  const [rows, reps] = await Promise.all([budgetRows({ from: f.from, to: f.to, salesRep: f.salesRep }), salesReps()]);
  const t = totals(rows);
  const groups = bySalesRep(rows);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/informes" className="text-sm text-stone-500 hover:underline">‹ Informes</Link>
        <h1>Presupuesto y gasto de personal</h1>
        <p className="text-sm text-stone-500">Lo presupuestado en cada evento frente a lo que ha costado según los fichajes. En rojo, por encima del presupuesto; en verde, por debajo.</p>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="desde">Desde</label><input id="desde" type="date" name="desde" defaultValue={f.from} className="input" /></div>
        <div><label className="label" htmlFor="hasta">Hasta</label><input id="hasta" type="date" name="hasta" defaultValue={f.to} className="input" /></div>
        <div>
          <label className="label" htmlFor="comercial">Comercial</label>
          <select id="comercial" name="comercial" defaultValue={f.salesRep ?? ""} className="input">
            <option value="">Todos</option>
            {reps.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="-">Sin comercial</option>
          </select>
        </div>
        <button className="btn">Ver</button>
        <div className="ml-auto flex gap-2">
          <a href={`/admin/informes/presupuestos/pdf?${f.qs}`} target="_blank" className="btn">⬇ PDF</a>
          <a href={`/admin/informes/presupuestos/excel?${f.qs}`} className="btn">⬇ Excel</a>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3"><div className="text-2xl font-semibold tabular-nums">{euro(t.budget)}</div><div className="text-xs text-stone-500">Presupuestado ({t.done} eventos cerrados)</div></div>
        <div className="card p-3"><div className="text-2xl font-semibold tabular-nums">{euro(t.cost)}</div><div className="text-xs text-stone-500">Gasto real</div></div>
        <div className="card p-3"><div className={`text-2xl font-semibold tabular-nums ${devClass(t.deviation)}`}>{signed(t.deviation)}</div><div className="text-xs text-stone-500">Desviación</div></div>
        <div className="card p-3"><div className={`text-2xl font-semibold tabular-nums ${devClass(t.deviation)}`}>{pctText(t.pct)}</div><div className="text-xs text-stone-500">% sobre presupuesto</div></div>
      </div>

      {rows.length === 0 ? (
        <Empty>No hay eventos en este periodo.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table text-sm">
            <thead>
              <tr><th>Día</th><th>Evento / cliente</th><th>Comercial</th><th>Maître</th><th className="text-right">Presupuesto</th><th className="text-right">Gasto</th><th className="text-right">Desviación</th><th className="text-right">%</th><th>Comentario</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                  <td><Link href={`/admin/eventos/${r.id}`} className="link">{r.name}</Link>{r.client && <span className="block text-xs text-stone-500">{r.client}</span>}</td>
                  <td>{r.salesRep ?? <span className="text-stone-400">—</span>}</td>
                  <td>{r.lead ?? <span className="text-stone-400">—</span>}</td>
                  <td className="text-right tabular-nums">{euro(r.budget)}{r.estimated && <span className="text-stone-400" title="Calculado">*</span>}</td>
                  <td className="text-right tabular-nums">
                    {r.done || r.cost ? euro(r.cost) : "—"}
                    {r.pending > 0 && <span className="block text-xs text-amber-700">{r.pending} sin horas</span>}
                  </td>
                  <td className={`text-right tabular-nums ${devClass(r.deviation)}`}>{signed(r.deviation)}</td>
                  <td className={`text-right tabular-nums ${devClass(r.deviation)}`}>{pctText(r.pct)}</td>
                  <td className="text-xs text-stone-600">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {groups.length > 1 && (
        <section className="space-y-2">
          <h2>Por comercial</h2>
          <div className="card overflow-x-auto p-0">
            <table className="table text-sm">
              <thead><tr><th>Comercial</th><th className="text-right">Eventos</th><th className="text-right">Presupuesto</th><th className="text-right">Gasto</th><th className="text-right">Desviación</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.rep}>
                    <td><Link href={`/admin/informes/presupuestos?${new URLSearchParams({ desde: f.from, hasta: f.to, comercial: g.rep || "-" })}`} className="link">{g.rep || "Sin comercial"}</Link></td>
                    <td className="text-right">{g.done} de {g.events}</td>
                    <td className="text-right tabular-nums">{euro(g.budget)}</td>
                    <td className="text-right tabular-nums">{euro(g.cost)}</td>
                    <td className={`text-right tabular-nums ${devClass(g.deviation)}`}>{signed(g.deviation)}</td>
                    <td className={`text-right tabular-nums ${devClass(g.deviation)}`}>{pctText(g.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="text-xs text-stone-500">* Presupuesto calculado con el personal necesario, las tarifas y el horario. Los totales solo cuentan eventos con todas las horas cerradas.</p>
    </div>
  );
}
