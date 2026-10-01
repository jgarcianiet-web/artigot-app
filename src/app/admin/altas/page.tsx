import Link from "next/link";
import { ConfirmButton } from "@/components/client";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDate, today } from "@/lib/domain";
import { missingAltas } from "@/lib/employment";
import { deleteEmployment, registerEventAltasForm, toggleReported } from "./actions";
import { EmploymentForm, EndForm } from "./Forms";

const VIEWS = {
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

export default async function Employments({ searchParams }: { searchParams: Promise<{ ver?: string; mes?: string }> }) {
  const sp = await searchParams;
  const t = today();
  const view: View = sp.ver && sp.ver in VIEWS ? (sp.ver as View) : "activos";
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : t.slice(0, 7);
  const where =
    view === "activos" ? { startDate: { lte: t }, OR: [{ endDate: null }, { endDate: { gte: t } }] }
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
    db.worker.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
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

      {byEvent.size > 0 && (
        <section className="card space-y-2 border-red-300 bg-red-50">
          <h2>⚠️ Convocados sin alta (próximos 14 días)</h2>
          <ul className="space-y-2 text-sm">
            {[...byEvent.values()].map(({ event, names }) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={`/admin/eventos/${event.id}`} className="link font-medium">{event.name}</Link> · {formatDate(event.date)}: {names.join(", ")}
                </span>
                <form action={registerEventAltasForm.bind(null, event.id)}>
                  <button className="btn btn-sm">Registrar sus altas ({names.length})</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="card">
        <summary className="cursor-pointer font-semibold">+ Nueva alta</summary>
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

      {rows.length === 0 ? (
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
