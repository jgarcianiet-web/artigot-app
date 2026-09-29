import Link from "next/link";
import { Empty, RoleBadge, Stars } from "@/components/ui";
import { db } from "@/lib/db";
import { isRole, ROLE_PLURAL, ROLES, today } from "@/lib/domain";

export default async function StaffList({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; inactivos?: string }>;
}) {
  const { q = "", role = "", inactivos } = await searchParams;
  const t = today();
  const workers = await db.worker.findMany({
    where: {
      active: inactivos ? undefined : true,
      role: isRole(role) ? role : undefined,
      OR: q ? [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { zone: { contains: q, mode: "insensitive" } },
          ] : undefined,
    },
    include: {
      unavailabilities: { where: { date: t }, select: { id: true } },
      _count: { select: { assignments: { where: { status: "CONFIRMADO" } } } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const counts = await db.worker.groupBy({ by: ["role"], where: { active: true }, _count: true });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Personal</h1>
        <Link href="/admin/personal/nuevo" className="btn btn-primary">+ Nuevo trabajador</Link>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {ROLES.map((r) => (
          <span key={r} className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-stone-200">
            {ROLE_PLURAL[r]}: <strong>{counts.find((c) => c.role === r)?._count ?? 0}</strong>
          </span>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar nombre, teléfono o zona…" className="input max-w-xs" />
        <select name="role" defaultValue={role} className="input w-auto">
          <option value="">Todos los puestos</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_PLURAL[r]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="inactivos" value="1" defaultChecked={!!inactivos} /> Incluir inactivos
        </label>
        <button className="btn">Filtrar</button>
      </form>

      {workers.length === 0 ? (
        <Empty>No hay trabajadores con esos filtros.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Puesto</th>
                <th>Valoración</th>
                <th>Teléfono</th>
                <th className="hidden md:table-cell">Zona</th>
                <th className="text-right">Servicios</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className={w.active ? "" : "opacity-50"}>
                  <td>
                    <Link href={`/admin/personal/${w.id}`} className="link">{w.name}</Link>
                    {w.unavailabilities.length > 0 && <span className="ml-2 text-xs text-red-600">No disponible hoy</span>}
                    {!w.active && <span className="ml-2 text-xs text-stone-500">Inactivo</span>}
                  </td>
                  <td><RoleBadge role={w.role} /></td>
                  <td><Stars value={w.rating} /></td>
                  <td className="whitespace-nowrap"><a href={`tel:${w.phone}`}>{w.phone}</a></td>
                  <td className="hidden text-stone-500 md:table-cell">{w.zone}</td>
                  <td className="text-right">{w._count.assignments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
