import Link from "next/link";
import { Empty, RoleBadge, ScoreBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { duplicateGroups } from "@/lib/mergeWorkers";
import { isFixed, isRole, ROLE_PLURAL, ROLES, today } from "@/lib/domain";
import { computeScores, explainScore } from "@/lib/scoring";
import { incompleteWorkers } from "@/lib/completeness";
import { BulkBar, SelectAll } from "./BulkBar";

export default async function StaffList({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; inactivos?: string; orden?: string; incompletos?: string; sinavisos?: string }>;
}) {
  const { q = "", role = "", inactivos, orden = "puntuacion", incompletos, sinavisos } = await searchParams;
  const t = today();
  const workers = await db.worker.findMany({
    where: {
      active: inactivos ? undefined : true,
      role: isRole(role) ? role : undefined,
      OR: q ? [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { dni: { contains: q.toUpperCase().replace(/[\s-]/g, "") } },
            { zone: { contains: q, mode: "insensitive" } },
          ] : undefined,
    },
    include: {
      unavailabilities: { where: { date: t }, select: { id: true } },
      _count: { select: { assignments: { where: { status: "CONFIRMADO" } }, devices: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const incomplete = new Map((await incompleteWorkers(workers.map((w) => w.id))).map((w) => [w.id, w.missing]));
  if (incompletos) workers.splice(0, workers.length, ...workers.filter((w) => incomplete.has(w.id)));
  if (sinavisos) workers.splice(0, workers.length, ...workers.filter((w) => w._count.devices === 0));
  const noPush = await db.worker.count({ where: { active: true, devices: { none: {} } } });
  const scores = await computeScores(workers.map((w) => w.id), t);
  if (orden === "puntuacion") {
    workers.sort((a, b) => a.role.localeCompare(b.role) || scores.get(b.id)!.score - scores.get(a.id)!.score);
  }
  const counts = await db.worker.groupBy({ by: ["role"], where: { active: true }, _count: true });
  const repeated = (await duplicateGroups()).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Personal</h1>
        <div className="flex flex-wrap gap-2">
          {repeated > 0 && <Link href="/admin/personal/repetidos" className="btn border-amber-300 bg-amber-50 text-amber-900">⚠ {repeated} {repeated === 1 ? "persona repetida" : "personas repetidas"}</Link>}
          <Link href="/admin/personal/importar" className="btn">Importar Excel</Link>
          <a href="/admin/personal/exportar" className="btn">Exportar códigos</a>
          <Link href="/admin/personal/nuevo" className="btn btn-primary">+ Nuevo trabajador</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {ROLES.map((r) => (
          <span key={r} className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-stone-200">
            {ROLE_PLURAL[r]}: <strong>{counts.find((c) => c.role === r)?._count ?? 0}</strong>
          </span>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar nombre, DNI, teléfono o zona…" className="input max-w-xs" />
        <select name="role" defaultValue={role} className="input w-auto">
          <option value="">Todos los puestos</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_PLURAL[r]}</option>
          ))}
        </select>
        <select name="orden" defaultValue={orden} className="input w-auto">
          <option value="puntuacion">Por puntuación</option>
          <option value="nombre">Por nombre</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="inactivos" value="1" defaultChecked={!!inactivos} /> Incluir inactivos
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="incompletos" value="1" defaultChecked={!!incompletos} /> Solo datos incompletos
        </label>
        <label className="flex items-center gap-1.5 text-sm" title="No han activado los avisos de la app en ningún móvil: no les llegan las convocatorias">
          <input type="checkbox" name="sinavisos" value="1" defaultChecked={!!sinavisos} /> Solo sin avisos ({noPush})
        </label>
        <button className="btn">Filtrar</button>
      </form>

      {workers.length === 0 ? (
        <Empty>No hay trabajadores con esos filtros.</Empty>
      ) : (
        <>
        <BulkBar />
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th className="w-8"><SelectAll /></th>
                <th>Nombre</th>
                <th>Puesto</th>
                <th title="Puntuación del algoritmo (0-100)">Puntuación</th>
                <th>Teléfono</th>
                <th className="hidden md:table-cell">Zona</th>
                <th className="text-right">Servicios</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className={w.active ? "" : "opacity-50"}>
                  <td><input type="checkbox" name="ids" value={w.id} form="bulk-workers" aria-label={`Seleccionar a ${w.name}`} className="size-4" /></td>
                  <td>
                    <Link href={`/admin/personal/${w.id}`} className="link">{w.name}</Link>
                    {w.unavailabilities.length > 0 && <span className="ml-2 text-xs text-red-600">No disponible hoy</span>}
                    {!w.active && <span className="ml-2 text-xs text-stone-500">Inactivo</span>}
                    {incomplete.has(w.id) && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 text-[11px] text-amber-900" title={`Falta: ${incomplete.get(w.id)!.join(", ")}`}>Datos incompletos</span>
                    )}
                    {w._count.devices === 0 && (
                      <span className="ml-2 text-[11px] text-amber-700" title="No ha activado los avisos de la app: no le llegan las convocatorias">🔕 sin avisos</span>
                    )}
                  </td>
                  <td><RoleBadge role={w.role} />{isFixed(w) && <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-800" title={w.noClock ? "Fijo, no ficha" : "Fijo"}>Fijo{w.noClock ? " · sin fichaje" : ""}</span>}</td>
                  <td><ScoreBadge score={scores.get(w.id)!.score} title={explainScore(scores.get(w.id)!)} /></td>
                  <td className="whitespace-nowrap">{w.phone ? <a href={`tel:${w.phone}`}>{w.phone}</a> : <span className="text-stone-400">—</span>}</td>
                  <td className="hidden text-stone-500 md:table-cell">{w.zone}</td>
                  <td className="text-right">{w._count.assignments}</td>
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
