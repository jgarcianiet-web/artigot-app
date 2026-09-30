import Link from "next/link";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { auditWhere, fmtAt, type AuditFilters } from "@/lib/auditQuery";

const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilters & { p?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  const where = auditWhere(sp);
  const [rows, total, entities, actors] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    db.auditLog.findMany({ distinct: ["actor"], select: { actor: true }, orderBy: { actor: "asc" }, where: { action: { notIn: ["Acceso fallido"] } } }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "p" && v) as [string, string][]);
  const pageLink = (n: number) => `/admin/registro?${new URLSearchParams({ ...Object.fromEntries(qs), p: String(n) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1>Registro de cambios</h1>
          <p className="text-sm text-stone-500">Quién ha cambiado qué y cuándo: horas, pagos, altas, datos del personal, eventos, accesos y ajustes.</p>
        </div>
        <a href={`/admin/registro/exportar?${qs}`} className="btn">Exportar Excel</a>
      </div>
      <form className="card grid gap-2 sm:grid-cols-6">
        <input name="q" defaultValue={sp.q} placeholder="Buscar (nombre, IBAN, evento…)" className="input sm:col-span-2" />
        <select name="entidad" defaultValue={sp.entidad ?? ""} className="input">
          <option value="">Todo</option>
          {entities.map((e) => <option key={e.entity}>{e.entity}</option>)}
        </select>
        <select name="quien" defaultValue={sp.quien ?? ""} className="input">
          <option value="">Cualquiera</option>
          {actors.map((a) => <option key={a.actor}>{a.actor}</option>)}
        </select>
        <input type="date" name="desde" defaultValue={sp.desde} className="input" aria-label="Desde" />
        <input type="date" name="hasta" defaultValue={sp.hasta} className="input" aria-label="Hasta" />
        {sp.id && <input type="hidden" name="id" value={sp.id} />}
        <div className="flex gap-2 sm:col-span-6">
          <button className="btn btn-primary">Filtrar</button>
          <Link href="/admin/registro" className="btn">Quitar filtros</Link>
          <span className="ml-auto self-center text-sm text-stone-500">{total} {total === 1 ? "cambio" : "cambios"}</span>
        </div>
      </form>
      {rows.length === 0 ? (
        <Empty>No hay cambios con estos filtros.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table text-sm">
            <thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap tabular-nums text-stone-500">{fmtAt(r.at)}</td>
                  <td className="whitespace-nowrap">{r.actor}<div className="text-xs text-stone-400">{r.actorKind}</div></td>
                  <td className="whitespace-nowrap"><span className={r.action === "Acceso fallido" ? "text-red-700" : ""}>{r.entity}</span><div className="text-xs text-stone-500">{r.action}</div></td>
                  <td className="min-w-72">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link href={pageLink(page - 1)} className="btn">‹ Más recientes</Link>}
          <span>Página {page} de {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total && <Link href={pageLink(page + 1)} className="btn">Anteriores ›</Link>}
        </div>
      )}
    </div>
  );
}
