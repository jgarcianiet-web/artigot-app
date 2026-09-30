import Link from "next/link";
import { Empty } from "@/components/ui";
import { euro, formatDate, num, today } from "@/lib/domain";
import { halfFromKey, halfLabel, halfOf, payPeriod, shiftHalf } from "@/lib/pay";
import { validIban } from "@/lib/staff";
import { markPaid, reopenPeriod } from "./actions";
import { ImportNetsForm, NetsForm, PayDateForm, RemittanceForm } from "./PayForms";
import { ConfirmButton } from "@/components/client";

const STATUS = {
  ABIERTA: { label: "Abierta", cls: "bg-stone-100 text-stone-700" },
  CERRADA: { label: "Remesa generada", cls: "bg-amber-100 text-amber-900" },
  PAGADA: { label: "Pagada", cls: "bg-emerald-100 text-emerald-800" },
} as const;

export default async function Payments({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  // Por defecto, la última quincena terminada (se paga a quincena vencida)
  const h = (sp.q && halfFromKey(sp.q)) || shiftHalf(halfOf(today()), -1);
  const p = await payPeriod(h);
  const st = STATUS[p.status as keyof typeof STATUS] ?? STATUS.ABIERTA;
  const open = p.status === "ABIERTA";
  const totals = p.rows.reduce(
    (t, r) => ({ gross: t.gross + r.gross, ss: t.ss + r.ss, irpf: t.irpf + r.irpf, net: t.net + r.net, hours: t.hours + r.hours }),
    { gross: 0, ss: 0, irpf: 0, net: 0, hours: 0 },
  );
  const pending = p.rows.reduce((n, r) => n + r.pending, 0);
  const noIban = p.rows.filter((r) => r.net > 0 && !(r.iban && validIban(r.iban)));
  const estimated = p.rows.filter((r) => !r.final).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>Pagos</h1>
        <Link href="/admin/ajustes/pagos" className="text-sm text-stone-500 hover:underline">Ajustes de pagos y remesas</Link>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/admin/pagos?q=${shiftHalf(h, -1).key}`} className="btn" aria-label="Quincena anterior">‹</Link>
        <span className="min-w-52 text-center font-semibold">Quincena {halfLabel(h)}</span>
        <Link href={`/admin/pagos?q=${shiftHalf(h, 1).key}`} className="btn" aria-label="Quincena siguiente">›</Link>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card"><div className="text-2xl font-semibold tabular-nums">{euro(totals.net)}</div><div className="text-sm text-stone-500">Neto a pagar</div></div>
        <div className="card"><div className="text-2xl font-semibold tabular-nums">{euro(totals.gross)}</div><div className="text-sm text-stone-500">Bruto</div></div>
        <div className="card"><div className="text-2xl font-semibold tabular-nums">{p.rows.length}</div><div className="text-sm text-stone-500">Personas · {num(totals.hours)} h</div></div>
        <div className="card"><div className="text-lg font-semibold">{formatDate(p.payDate, { long: true })}</div><div className="text-sm text-stone-500">Pago {p.payDateIsDefault ? "previsto (por defecto)" : "previsto"}</div></div>
      </div>

      <section className="card grid gap-4 md:grid-cols-2">
        <PayDateForm k={h.key} payDate={p.payDate} disabled={p.status === "PAGADA"} />
        <div className="text-sm text-stone-600">
          <p>El personal ve esta fecha y su neto en la app (Nómina).</p>
          <p className="mt-1">Neto estimado = bruto − Seguridad Social ({num(p.settings.ssPct)} %) − IRPF ({num(p.settings.irpfPct)} % o el de cada persona). Pon o importa el neto real de A3 para que la remesa pague lo exacto.</p>
        </div>
      </section>

      {pending > 0 && open && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ {pending} servicios de esta quincena no tienen las horas cerradas. <Link href={`/admin/liquidacion?desde=${h.from}&hasta=${h.to}`} className="link">Revisar en Liquidación</Link>
        </p>
      )}

      {p.rows.length === 0 ? (
        <Empty>No hay servicios confirmados entre {formatDate(h.from)} y {formatDate(h.to)}.</Empty>
      ) : (
        <NetsForm k={h.key} rows={open ? p.rows : []}>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th className="text-right">Servicios</th>
                  <th className="text-right">Horas</th>
                  <th className="text-right">Bruto</th>
                  <th className="text-right">S. Social</th>
                  <th className="text-right">IRPF</th>
                  <th className="text-right">Neto estimado</th>
                  <th className="text-right">Neto a pagar</th>
                  <th>IBAN</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.workerId}>
                    <td>
                      <Link href={`/admin/personal/${r.workerId}`} className="link">{r.name}</Link>
                      {r.pending > 0 && <span className="ml-2 text-xs text-amber-700">{r.pending} sin horas</span>}
                    </td>
                    <td className="text-right">{r.services}</td>
                    <td className="text-right">{num(r.hours)}</td>
                    <td className="text-right tabular-nums">{euro(r.gross)}</td>
                    <td className="text-right tabular-nums text-stone-500">−{euro(r.ss)}</td>
                    <td className="text-right tabular-nums text-stone-500">−{euro(r.irpf)} <span className="text-xs">({num(r.irpfPct)} %)</span></td>
                    <td className="text-right tabular-nums">{euro(r.netEstimate)}</td>
                    <td className="text-right">
                      {open ? (
                        <input
                          name={`net_${r.workerId}`}
                          inputMode="decimal"
                          defaultValue={r.final ? String(r.net).replace(".", ",") : ""}
                          placeholder={String(r.netEstimate).replace(".", ",")}
                          aria-label={`Neto de ${r.name}`}
                          className="input w-28 text-right"
                        />
                      ) : (
                        <span className="font-medium tabular-nums">{euro(r.net)}</span>
                      )}
                    </td>
                    <td className="text-xs">{r.iban && validIban(r.iban) ? <span className="text-emerald-700">✓ …{r.iban.slice(-4)}</span> : <span className="text-red-600">Falta</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={3}>Total</td>
                  <td className="px-3 py-2 text-right">{euro(totals.gross)}</td>
                  <td className="px-3 py-2 text-right">−{euro(totals.ss)}</td>
                  <td className="px-3 py-2 text-right">−{euro(totals.irpf)}</td>
                  <td />
                  <td className="px-3 py-2 text-right">{euro(totals.net)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {open && estimated > 0 && <p className="text-xs text-stone-500">{estimated} con el neto estimado (casilla vacía). Escribe el neto real o impórtalo desde A3.</p>}
        </NetsForm>
      )}

      {p.rows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {open && (
            <section className="card space-y-2">
              <h2>Netos desde A3</h2>
              <ImportNetsForm k={h.key} />
              <a href={`/admin/liquidacion/a3?desde=${h.from}&hasta=${h.to}`} className="link text-sm">Exportar las horas de esta quincena a A3</a>
            </section>
          )}
          <section className="card space-y-3">
            <h2>Remesa bancaria</h2>
            {p.status !== "PAGADA" && (
              <>
                <p className="text-sm text-stone-600">
                  Genera el fichero SEPA de transferencias (ISO 20022, pago de nóminas) para subirlo a la banca online. Al generarlo se congelan los importes de la quincena.
                </p>
                {noIban.length > 0 && <p className="text-sm text-red-600">Sin IBAN válido (no entran en la remesa): {noIban.map((r) => r.name).join(", ")}.</p>}
                <RemittanceForm k={h.key} pending={open ? pending : 0} />
              </>
            )}
            {p.remittances.length > 0 && (
              <ul className="divide-y text-sm">
                {p.remittances.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{r.count} transferencias · {euro(r.total)} · ejecución {formatDate(r.execDate)} <span className="text-stone-400">({r.createdBy})</span></span>
                    <a href={`/admin/pagos/remesa/${r.id}`} className="link">Descargar</a>
                  </li>
                ))}
              </ul>
            )}
            {p.status === "CERRADA" && (
              <div className="flex flex-wrap gap-2">
                <form action={markPaid.bind(null, h.key)}>
                  <ConfirmButton message="¿Marcar la quincena como pagada? Se avisará a cada persona de su importe." className="btn btn-primary">✓ Marcar como pagada</ConfirmButton>
                </form>
                <form action={reopenPeriod.bind(null, h.key)}>
                  <ConfirmButton message="¿Reabrir la quincena? Los importes se volverán a calcular. Si ya subiste la remesa al banco, no la reabras." className="btn">Reabrir</ConfirmButton>
                </form>
              </div>
            )}
            {p.status === "PAGADA" && p.period?.paidAt && (
              <p className="text-sm text-emerald-700">✓ Pagada el {new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long" }).format(p.period.paidAt)}.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
