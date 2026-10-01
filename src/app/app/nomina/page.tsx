import Link from "next/link";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { euro, formatDate, num, ROLE_LABEL, today, type Role } from "@/lib/domain";
import { deductions, getPaySettings, halfFromKey, halfLabel, netOf, payPeriod } from "@/lib/pay";
import { workerMonth } from "@/lib/staff";
import { monthRecordDocs } from "@/lib/timeRecord";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const shift = (month: string, d: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
};

export default async function MyPay({ searchParams }: { searchParams: Promise<{ mes?: string; q?: string }> }) {
  const me = await requireWorker();
  const sp = await searchParams;
  const current = today().slice(0, 7);
  const asked = sp.q && halfFromKey(sp.q) ? sp.q.slice(0, 7) : sp.mes;
  const month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= current ? asked : current;
  const [m, s, worker] = await Promise.all([
    workerMonth(me.id, month),
    getPaySettings(),
    db.worker.findUniqueOrThrow({ where: { id: me.id }, select: { iban: true } }),
  ]);
  const record = (await monthRecordDocs(month, me.id))[0];
  const halves = await Promise.all([1, 2].map((n) => payPeriod(halfFromKey(`${month}-${n}`)!, { workerId: me.id })));
  const [y, mm] = month.split("-").map(Number);
  const { ssPct, irpfPct } = deductions(s);
  const monthNet = halves.reduce((t, p) => t + (p.rows[0]?.net ?? 0), 0);

  return (
    <div className="space-y-4">
      <h1>Mis horas y pagos</h1>
      <div className="flex items-center justify-between">
        <Link href={`/app/nomina?mes=${shift(month, -1)}`} className="btn" aria-label="Mes anterior">‹</Link>
        <span className="font-semibold first-letter:uppercase">{MONTHS[mm - 1]} {y}</span>
        {month < current ? (
          <Link href={`/app/nomina?mes=${shift(month, 1)}`} className="btn" aria-label="Mes siguiente">›</Link>
        ) : (
          <span className="w-10" />
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card p-3"><div className="text-2xl font-semibold tabular-nums">{m.services}</div><div className="text-xs text-stone-500">Servicios</div></div>
        <div className="card p-3"><div className="text-2xl font-semibold tabular-nums">{num(m.hours)}</div><div className="text-xs text-stone-500">Horas</div></div>
        <div className="card p-3"><div className="text-2xl font-semibold tabular-nums">{euro(monthNet)}</div><div className="text-xs text-stone-500">Importe neto</div></div>
      </div>

      {halves.map((p) => {
        const row = p.rows[0];
        const events = m.rows.filter((r) => r.event.date >= p.half.from && r.event.date <= p.half.to);
        const paid = p.status === "PAGADA";
        // Con el neto definitivo (o la quincena cerrada) no se muestran importes por evento que podrían no cuadrar
        const perEvent = p.status === "ABIERTA" && !row?.final;
        return (
          <section key={p.half.key} id={p.half.key} className={`card space-y-2 ${sp.q === p.half.key ? "ring-2 ring-brand-600" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base">Quincena {halfLabel(p.half)}</h2>
                <p className={`text-sm ${paid ? "text-emerald-700" : "text-stone-600"}`}>
                  {paid
                    ? `✓ Pagado${p.period?.paidAt ? ` el ${new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long" }).format(p.period.paidAt)}` : ""}`
                    : `💶 Pago previsto: ${formatDate(p.payDate, { long: true })}`}
                </p>
              </div>
              {row && (row.gross > 0 || row.final) ? (
                <div className="text-right">
                  <div className="text-xl font-semibold tabular-nums">{euro(row.net)}</div>
                  <div className="text-xs text-stone-500">{row.final || !perEvent || s.ratesAreNet ? "neto" : "neto estimado"}</div>
                </div>
              ) : row ? (
                <div className="text-right text-xs text-stone-400">pendiente de horas</div>
              ) : null}
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-stone-500">Sin servicios en esta quincena.</p>
            ) : (
              <ul className="divide-y divide-stone-100 text-sm">
                {events.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.event.name}</span>
                      <span className="text-xs text-stone-500">
                        {formatDate(r.event.date)} · {ROLE_LABEL[r.role as Role]}
                        {r.checkIn && ` · ${r.checkIn}–${r.checkOut ?? "…"}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {r.billedHours != null ? (
                        <>
                          {perEvent && <span className="block">{euro(netOf(r.amount, ssPct, irpfPct).net)}</span>}
                          <span className={perEvent ? "text-xs text-stone-500" : ""}>{num(r.billedHours)} h</span>
                        </>
                      ) : (
                        <span className="text-xs text-stone-400">horas pendientes</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {row && row.pending > 0 && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                {row.pending} {row.pending === 1 ? "servicio aún no tiene" : "servicios aún no tienen"} las horas cerradas; el importe puede cambiar.
              </p>
            )}
          </section>
        );
      })}

      {record && (
        <Link href={`/app/firmar/${record.id}`} className="card flex items-center justify-between text-sm">
          <span>🕒 Registro de jornada de {MONTHS[mm - 1]}</span>
          <span className={record.signedAt ? "text-emerald-700" : "font-medium text-stone-900 underline"}>{record.signedAt ? "✓ Firmado" : "Firmar ›"}</span>
        </Link>
      )}

      {!worker.iban && m.services > 0 && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
          Para cobrar por transferencia necesitamos tu IBAN. <Link href="/app/perfil" className="underline">Añádelo en tu perfil</Link>.
        </p>
      )}
      <p className="text-xs text-stone-500">
        Pagamos a quincena vencida: del 1 al 15, hacia el día {s.firstHalfDay}; del 16 a fin de mes, la primera semana del mes siguiente.
        {s.ratesAreNet
          ? "Los importes son lo que cobras por cada servicio."
          : `El neto estimado descuenta la Seguridad Social (${num(ssPct)} %) y la retención de IRPF (${num(irpfPct)} %). El importe definitivo es el de tu nómina.`}
      </p>
    </div>
  );
}
