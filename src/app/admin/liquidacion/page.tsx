import Link from "next/link";
import { Empty, RoleBadge } from "@/components/ui";
import { euro, formatDate, num, today } from "@/lib/domain";
import { monthRange, payrollLines, summarize } from "@/lib/payroll";

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function Payroll({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const sp = await searchParams;
  const def = monthRange(today());
  const from = isDate(sp.desde) ? sp.desde! : def.from;
  const to = isDate(sp.hasta) ? sp.hasta! : def.to;
  const lines = await payrollLines(from, to, { extras: true });
  const rows = summarize(lines);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const missing = rows.reduce((s, r) => s + r.missing, 0);
  const qs = `desde=${from}&hasta=${to}`;

  return (
    <div className="space-y-4">
      <h1>Liquidación</h1>
      <p className="text-sm text-stone-500">Personal extra (contrato 300), que cobra por horas. Los fijos van en su nómina: sus horas y lo que hacen de más están en la pestaña «Fijos».</p>
      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Desde</label>
          <input type="date" name="desde" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" name="hasta" defaultValue={to} className="input" />
        </div>
        <button className="btn">Ver</button>
        <div className="ml-auto flex gap-2">
          <a href={`/admin/liquidacion/exportar?${qs}`} className="btn">Exportar resumen (Excel)</a>
          <a href={`/admin/liquidacion/exportar?${qs}&detalle=1`} className="btn">Exportar detalle (Excel)</a>
          <a href={`/admin/liquidacion/a3?${qs}`} className="btn btn-primary">Exportar a A3</a>
        </div>
      </form>

      <div className="grid grid-cols-3 gap-3">
        <div className="card"><div className="text-2xl font-semibold">{euro(total)}</div><div className="text-sm text-stone-500">Total a pagar</div></div>
        <div className="card"><div className="text-2xl font-semibold">{num(totalHours)}</div><div className="text-sm text-stone-500">Horas liquidables</div></div>
        <div className={`card ${missing ? "border-amber-300 bg-amber-50" : ""}`}>
          <div className="text-2xl font-semibold">{missing}</div>
          <div className="text-sm text-stone-500">Servicios sin horas</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>No hay servicios confirmados entre {formatDate(from)} y {formatDate(to)}.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Puesto</th>
                <th className="text-right">Servicios</th>
                <th className="text-right">Horas</th>
                <th className="text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.worker.id}>
                  <td>
                    <Link href={`/admin/personal/${r.worker.id}`} className="link">{r.worker.name}</Link>
                    {r.missing > 0 && <span className="ml-2 text-xs text-amber-700">{r.missing} sin horas</span>}
                  </td>
                  <td><RoleBadge role={r.worker.role} /></td>
                  <td className="text-right">{r.services}</td>
                  <td className="text-right">{num(r.hours)}</td>
                  <td className="text-right font-medium">{euro(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-stone-500">
        Solo cuentan servicios confirmados. Las horas se calculan con el fichaje (o las horas manuales) aplicando el mínimo por puesto definido en <Link href="/admin/tarifas" className="link">Tarifas</Link>.
      </p>
    </div>
  );
}
