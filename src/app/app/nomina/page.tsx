import Link from "next/link";
import { requireWorker } from "@/lib/auth";
import { euro, formatDate, num, ROLE_LABEL, today, type Role } from "@/lib/domain";
import { workerMonth } from "@/lib/staff";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const shift = (month: string, d: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
};

export default async function MyPay({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const me = await requireWorker();
  const sp = await searchParams;
  const current = today().slice(0, 7);
  const month = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) && sp.mes <= current ? sp.mes : current;
  const m = await workerMonth(me.id, month);
  const [y, mm] = month.split("-").map(Number);

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
        <div className="card p-3"><div className="text-2xl font-semibold tabular-nums">{euro(m.amount)}</div><div className="text-xs text-stone-500">Importe bruto</div></div>
      </div>
      {m.pending > 0 && (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          {m.pending} {m.pending === 1 ? "servicio aún no tiene" : "servicios aún no tienen"} las horas cerradas; el importe puede cambiar.
        </p>
      )}
      {m.rows.length === 0 ? (
        <p className="text-sm text-stone-500">No tienes servicios confirmados este mes.</p>
      ) : (
        <ul className="card divide-y divide-stone-100 p-0 text-sm">
          {m.rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
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
                    <span className="block">{euro(r.amount)}</span>
                    <span className="text-xs text-stone-500">{num(r.billedHours)} h × {euro(r.hourlyRate)}</span>
                  </>
                ) : (
                  <span className="text-xs text-stone-400">pendiente</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-stone-500">Importes brutos estimados según las tarifas actuales y el mínimo de horas de cada puesto. La nómina oficial la emite la empresa.</p>
    </div>
  );
}
