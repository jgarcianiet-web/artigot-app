import Link from "next/link";
import { Empty, RoleBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { clocksIn, CONTRACT_SHORT, euro, formatDate, num, today } from "@/lib/domain";
import { monthRange, payrollLines } from "@/lib/payroll";

/**
 * Fijos (contrato 100 / 200): cobran su nómina mensual. Aquí se ve cada mes lo que han trabajado,
 * valorado con su tarifa, frente a su nómina: lo que pasa de la nómina se les paga aparte.
 * Quien no ficha (p. ej. el maître fijo) cuenta con el horario previsto de cada evento.
 */
export default async function Fixed({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : today().slice(0, 7);
  const { from, to } = monthRange(`${month}-01`);
  const [workers, lines] = await Promise.all([
    db.worker.findMany({ where: { active: true, contractCode: { in: ["100", "200"] } }, orderBy: { name: "asc" } }),
    payrollLines(from, to),
  ]);
  const rows = workers.map((w) => {
    const mine = lines.filter((l) => l.a.workerId === w.id);
    const value = Math.round(mine.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const hours = mine.reduce((s, l) => s + (l.billedHours ?? 0), 0);
    const salary = w.monthlySalary;
    return { w, mine, value, hours, pending: mine.filter((l) => l.hours == null).length, salary, extra: salary != null ? Math.max(0, value - salary) : null, left: salary != null ? Math.max(0, salary - value) : null };
  });
  const totalExtra = rows.reduce((s, r) => s + (r.extra ?? 0), 0);
  const [y, m] = month.split("-").map(Number);
  const shift = (n: number) => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto">Fijos</h1>
        <Link href={`/admin/fijos?mes=${shift(-1)}`} className="btn" aria-label="Mes anterior">‹</Link>
        <span className="min-w-40 text-center font-semibold first-letter:uppercase">{monthName}</span>
        <Link href={`/admin/fijos?mes=${shift(1)}`} className="btn" aria-label="Mes siguiente">›</Link>
      </div>
      <p className="text-sm text-stone-500">
        Personal fijo (contrato 100 o 200) con nómina mensual. Sus servicios se valoran con su tarifa; lo que pase de la nómina se le paga aparte. Para marcar a alguien como fijo: en su ficha o seleccionando a varios en Personal.
      </p>
      {rows.length === 0 ? (
        <Empty>No hay nadie marcado como fijo.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="card p-3"><div className="text-2xl font-semibold">{rows.length}</div><div className="text-xs text-stone-500">Fijos</div></div>
            <div className="card p-3"><div className="text-2xl font-semibold">{euro(totalExtra)}</div><div className="text-xs text-stone-500">A pagar aparte (pasa de la nómina)</div></div>
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="table text-sm">
              <thead>
                <tr><th>Persona</th><th className="text-right">Servicios</th><th className="text-right">Horas</th><th className="text-right">Valor del mes</th><th className="text-right">Nómina</th><th className="text-right">Pasa de la nómina</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.w.id} className="align-top">
                    <td>
                      <Link href={`/admin/personal/${r.w.id}`} className="link">{r.w.name}</Link>
                      <div className="text-xs text-stone-500">{CONTRACT_SHORT[r.w.contractCode ?? ""]}{clocksIn(r.w) ? "" : " · no ficha (horario previsto)"}</div>
                      {r.mine.length > 0 && (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer text-stone-500">Ver servicios</summary>
                          <ul className="mt-1 space-y-0.5">
                            {r.mine.map((l) => (
                              <li key={l.a.id} className="flex flex-wrap items-center gap-1">
                                <span>{formatDate(l.a.event.date)} · {l.a.event.name}</span>
                                <RoleBadge role={l.a.role} />
                                <span className="text-stone-500">{l.billedHours != null ? `${num(l.billedHours)} h` : "sin fichar"} · {euro(l.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="text-right">{r.mine.length}</td>
                    <td className="text-right">{num(r.hours)}{r.pending > 0 && <div className="text-xs text-amber-700">{r.pending} sin fichar</div>}</td>
                    <td className="text-right">{euro(r.value)}</td>
                    <td className="text-right">{r.salary != null ? euro(r.salary) : <Link href={`/admin/personal/${r.w.id}/editar`} className="text-xs text-stone-400 underline">poner</Link>}</td>
                    <td className="text-right">
                      {r.extra == null ? "—" : r.extra > 0 ? <strong className="text-emerald-700">{euro(r.extra)}</strong> : <span className="text-xs text-stone-500">le faltan {euro(r.left!)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
