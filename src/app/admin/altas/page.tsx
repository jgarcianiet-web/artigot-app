import Link from "next/link";
import { ConfirmButton } from "@/components/client";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDate, today } from "@/lib/domain";
import { missingAltas } from "@/lib/employment";
import { dayMovements, employmentWarnings, syncAutoEmployments } from "@/lib/autoAltas";
import { addDays } from "@/lib/domain";
import { deleteEmployment, markDayReported, toggleReported } from "./actions";
import { EmploymentForm, EndForm } from "./Forms";

const VIEWS = {
  dia: "Día a día",
  activos: "De alta ahora",
  mes: "Movimientos del mes",
  "sin-comunicar": "Sin comunicar a la S. S.",
  todos: "Todo el histórico",
} as const;
type View = keyof typeof VIEWS;

function Reported({ id, which, value }: { id: string; which: "start" | "end"; value: boolean }) {
  return (
    <form action={toggleReported.bind(null, id, which)} className="inline">
      <button className={`ml-1 rounded px-1.5 text-xs ${value ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`} title="Comunicada a la Seguridad Social (RED)">
        {value ? "✓ RED" : "Sin comunicar"}
      </button>
    </form>
  );
}

export default async function Employments({ searchParams }: { searchParams: Promise<{ ver?: string; mes?: string; dia?: string }> }) {
  const sp = await searchParams;
  const t = today();
  const view: View = sp.ver && sp.ver in VIEWS ? (sp.ver as View) : "dia";
  const day = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : t;
  // Las altas y bajas se generan solas con el personal confirmado
  await syncAutoEmployments();
  const [moves, warnings] = await Promise.all([view === "dia" ? dayMovements(day) : null, employmentWarnings()]);
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : t.slice(0, 7);
  const where =
    view === "dia" ? { id: "-" }
    : view === "activos" ? { startDate: { lte: t }, OR: [{ endDate: null }, { endDate: { gte: t } }] }
    : view === "mes" ? { OR: [{ startDate: { gte: `${month}-01`, lte: `${month}-31` } }, { endDate: { gte: `${month}-01`, lte: `${month}-31` } }] }
    : view === "sin-comunicar" ? { OR: [{ startReported: false }, { endDate: { not: null }, endReported: false }] }
    : {};
  const [rows, workers, missing] = await Promise.all([
    db.employment.findMany({
      where,
      include: { worker: { select: { id: true, name: true, dni: true, nss: true } } },
      orderBy: [{ startDate: "desc" }, { worker: { name: "asc" } }],
      take: 500,
    }),
    db.worker.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, dni: true, phone: true, zone: true } }),
    missingAltas(t, 14),
  ]);
  const byEvent = new Map<string, { event: (typeof missing)[number]["event"]; names: string[] }>();
  for (const a of missing) {
    const g = byEvent.get(a.event.id) ?? { event: a.event, names: [] };
    g.names.push(a.worker.name);
    byEvent.set(a.event.id, g);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>Altas y bajas</h1>
        <div className="flex gap-2">
          <Link href="/admin/altas/a3" className="btn">Alta en A3</Link>
          <Link href="/admin/altas/importar" className="btn">Importar Excel</Link>
          <a href={`/admin/altas/exportar?ver=${view}&mes=${month}`} className="btn">Exportar Excel</a>
        </div>
      </div>

      {warnings.length > 0 && (
        <section className="card space-y-2 border-amber-300 bg-amber-50">
          <h2>⚠️ Revisar en RED</h2>
          <ul className="space-y-1 text-sm">
            {warnings.map((e) => (
              <li key={e.id}><Link href={`/admin/personal/${e.worker.id}`} className="link font-medium">{e.worker.name}</Link>: {e.warning}</li>
            ))}
          </ul>
        </section>
      )}

      {byEvent.size > 0 && (
        <section className="card space-y-2 border-red-300 bg-red-50">
          <h2>⚠️ Confirmados sin alta (próximos 14 días)</h2>
          <p className="text-sm text-red-900">Tienen un alta puesta a mano que no cubre ese día; corrígela o bórrala y se generará sola.</p>
          <ul className="space-y-2 text-sm">
            {[...byEvent.values()].map(({ event, names }) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={`/admin/eventos/${event.id}`} className="link font-medium">{event.name}</Link> · {formatDate(event.date)}: {names.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="card">
        <summary className="cursor-pointer font-semibold">+ Alta a mano <span className="text-sm font-normal text-stone-500">(solo para excepciones: las de los eventos se hacen solas)</span></summary>
        <div className="pt-3"><EmploymentForm workers={workers} /></div>
      </details>

      <nav className="flex flex-wrap gap-1 text-sm">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={`/admin/altas?ver=${v}${v === "mes" ? `&mes=${month}` : ""}`} className={`rounded-md px-3 py-1.5 ${v === view ? "bg-brand-600 text-white" : "bg-stone-100 hover:bg-stone-200"}`}>
            {VIEWS[v]}
          </Link>
        ))}
        {view === "mes" && (
          <form className="ml-2 flex items-center gap-1">
            <input type="hidden" name="ver" value="mes" />
            <input type="month" name="mes" defaultValue={month} className="input py-1" />
            <button className="btn btn-sm">Ver</button>
          </form>
        )}
      </nav>

      {moves && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/altas?dia=${addDays(day, -1)}`} className="btn" aria-label="Día anterior">‹</Link>
            <span className="min-w-56 text-center font-semibold first-letter:uppercase">{formatDate(day, { long: true })}</span>
            <Link href={`/admin/altas?dia=${addDays(day, 1)}`} className="btn" aria-label="Día siguiente">›</Link>
            <form className="flex items-center gap-1"><input type="date" name="dia" defaultValue={day} className="input py-1" /><button className="btn btn-sm">Ir</button></form>
            {day !== t && <Link href="/admin/altas" className="text-sm text-stone-500 hover:underline">Hoy</Link>}
          </div>
          <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
            <div className="card p-3"><div className="text-2xl font-semibold">{moves.altas}</div><div className="text-xs text-stone-500">Altas (empiezan)</div></div>
            <div className="card p-3"><div className="text-2xl font-semibold">{moves.siguen}</div><div className="text-xs text-stone-500">Siguen mañana</div></div>
            <div className="card p-3"><div className="text-2xl font-semibold">{moves.bajas}</div><div className="text-xs text-stone-500">Bajas (último día)</div></div>
          </div>
          {(() => {
            const bajas = moves.bajasDelDia;
            const altas = moves.altasDelDia;
            const altasA3 = altas.filter((r) => r.a3Code);
            const altasNew = altas.filter((r) => !r.a3Code).map((r) => r.name);
            const noCode = bajas.filter((r) => !r.a3Code).map((r) => r.name);
            return (bajas.length > 0 || altas.length > 0) && (
              <div className="card space-y-2 text-sm">
                {altas.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {altasA3.length > 0 && <a href={`/admin/altas/a3-altas?dia=${day}`} className="btn btn-primary btn-sm">⬇ Excel de altas para A3 ({altasA3.length})</a>}
                    <form action={markDayReported.bind(null, day, "start")}><button className="btn btn-sm">✓ Altas del día comunicadas</button></form>
                    <span className="text-xs text-stone-500">Importa el Excel en A3 («MA - Alta sucesiva») para generar el SILTRA; después marca las altas como comunicadas.</span>
                    {altasNew.length > 0 && (
                      <span className="w-full text-xs text-amber-800">
                        Aún no están en A3 (sin código), van en el <Link href="/admin/altas/a3" className="link">alta masiva</Link>: {altasNew.join(", ")}
                      </span>
                    )}
                  </div>
                )}
                {bajas.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/admin/altas/a3-bajas?dia=${day}`} className="btn btn-primary btn-sm">⬇ Excel de bajas para A3 ({bajas.length})</a>
                    <form action={markDayReported.bind(null, day, "end")}><button className="btn btn-sm">✓ Bajas del día comunicadas</button></form>
                    <span className="text-xs text-stone-500">Importa el Excel en A3 («MB - Baja») para generar el SILTRA; después marca las bajas como comunicadas.</span>
                    {noCode.length > 0 && <span className="w-full text-xs text-red-700">Sin código de A3 (complétalo antes de importar): {noCode.join(", ")}</span>}
                  </div>
                )}
              </div>
            );
          })()}
          {moves.rows.length === 0 ? (
            <Empty>Nadie confirmado este día.</Empty>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="table text-sm">
                <thead><tr><th>Persona</th><th>DNI / NSS</th><th>Servicio</th><th>Alta S. S.</th><th>Baja S. S.</th></tr></thead>
                <tbody>
                  {moves.rows.map((r) => {
                    const e = r.employment;
                    return (
                      <tr key={r.workerId} className="align-top">
                        <td><Link href={`/admin/personal/${r.workerId}`} className="link">{r.name}</Link>{e?.warning && <div className="text-xs text-amber-700">⚠ {e.warning}</div>}</td>
                        <td className="whitespace-nowrap text-xs">{r.dni ?? <span className="text-red-600">sin DNI</span>}<br />{r.nss ?? <span className="text-red-600">sin NSS</span>}</td>
                        <td className="text-xs">{r.events}</td>
                        <td className="whitespace-nowrap">
                          {r.alta ? <span className="font-medium text-emerald-700">ALTA hoy</span> : <span className="text-stone-500">viene de antes{e && ` (alta ${formatDate(e.startDate)})`}</span>}
                          {r.alta && e && <Reported id={e.id} which="start" value={e.startReported} />}
                        </td>
                        <td className="whitespace-nowrap">
                          {r.sigue ? <span className="font-medium text-sky-700">SIGUE</span> : <span className="font-medium text-red-700">BAJA {r.bajaDate === day ? "hoy" : formatDate(r.bajaDate!)}</span>}
                          {!r.sigue && e && <Reported id={e.id} which="end" value={e.endReported} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-stone-500">
            Se calcula solo con el personal confirmado: los días seguidos son un único periodo (alta el primer día, baja el último; si el servicio pasa de medianoche, la baja es al día siguiente).
            Si alguien se cae o se añade, se actualiza. Lo ya comunicado a RED nunca se cambia sin avisar.
          </p>
        </section>
      )}

      {view === "dia" ? null : rows.length === 0 ? (
        <Empty>No hay registros en esta vista.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table text-sm">
            <thead>
              <tr><th>Persona</th><th>DNI / NSS</th><th>Contrato</th><th>Alta</th><th>Baja</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="align-top">
                  <td>
                    <Link href={`/admin/personal/${e.worker.id}`} className="link">{e.worker.name}</Link>
                    {e.notes && <div className="text-xs text-stone-500">{e.notes}</div>}
                  </td>
                  <td className="whitespace-nowrap text-xs">{e.worker.dni ?? <span className="text-red-600">sin DNI</span>}<br />{e.worker.nss ?? <span className="text-red-600">sin NSS</span>}</td>
                  <td>{e.contractType}{e.category && <div className="text-xs text-stone-500">{e.category}{e.hoursPerWeek ? ` · ${e.hoursPerWeek} h/sem` : ""}</div>}</td>
                  <td className="whitespace-nowrap">{formatDate(e.startDate)}<Reported id={e.id} which="start" value={e.startReported} /></td>
                  <td className="min-w-48">
                    {e.endDate ? (
                      <>
                        <span className="whitespace-nowrap">{formatDate(e.endDate)}<Reported id={e.id} which="end" value={e.endReported} /></span>
                        {e.endReason && <div className="text-xs text-stone-500">{e.endReason}</div>}
                      </>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-xs text-stone-500">Sin fecha · dar de baja</summary>
                        <div className="pt-2"><EndForm id={e.id} defaultDate={t} /></div>
                      </details>
                    )}
                  </td>
                  <td>
                    <form action={deleteEmployment.bind(null, e.id)}>
                      <ConfirmButton message="¿Borrar este registro de alta?" className="text-xs text-red-700 underline">Borrar</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-stone-500">
        «✓ RED» indica que el movimiento ya se ha comunicado a la Seguridad Social; pulsa para cambiarlo. El alta debe comunicarse antes de empezar a trabajar y la baja en los 3 días naturales siguientes.
      </p>
    </div>
  );
}
