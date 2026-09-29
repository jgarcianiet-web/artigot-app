import Link from "next/link";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { EVENT_TYPE_LABEL, formatDate, ROLE_PLURAL, ROLES, today } from "@/lib/domain";
import { coverage } from "@/lib/staffing";

export default async function EventList({ searchParams }: { searchParams: Promise<{ pasados?: string }> }) {
  const past = !!(await searchParams).pasados;
  const t = today();
  const events = await db.event.findMany({
    where: { date: past ? { lt: t } : { gte: t } },
    include: { assignments: { select: { role: true, status: true } } },
    orderBy: [{ date: past ? "desc" : "asc" }, { startTime: "asc" }],
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Eventos</h1>
        <Link href="/admin/eventos/nuevo" className="btn btn-primary">+ Nuevo evento</Link>
      </div>
      <div className="flex gap-1 text-sm">
        <Link href="/admin/eventos" className={`rounded-md px-3 py-1.5 ${!past ? "bg-brand-100 font-medium text-brand-900" : "hover:bg-stone-100"}`}>Próximos</Link>
        <Link href="/admin/eventos?pasados=1" className={`rounded-md px-3 py-1.5 ${past ? "bg-brand-100 font-medium text-brand-900" : "hover:bg-stone-100"}`}>Pasados</Link>
      </div>

      {events.length === 0 ? (
        <Empty>{past ? "No hay eventos pasados." : "No hay eventos programados."}</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Evento</th>
                <th className="hidden md:table-cell">Lugar</th>
                {ROLES.map((r) => (
                  <th key={r} className="text-center">{ROLE_PLURAL[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const cov = coverage(e, e.assignments);
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">
                      {formatDate(e.date)} <span className="text-stone-500">{e.startTime}</span>
                    </td>
                    <td>
                      <Link href={`/admin/eventos/${e.id}`} className="link">{e.name}</Link>
                      <span className="ml-2 text-xs text-stone-500">{EVENT_TYPE_LABEL[e.type]}</span>
                      {e.status === "CERRADO" && <span className="ml-2 text-xs text-stone-500">· Cerrado</span>}
                    </td>
                    <td className="hidden text-stone-500 md:table-cell">{e.venue}</td>
                    {cov.map((c) => (
                      <td key={c.role} className="text-center">
                        {c.need === 0 ? (
                          <span className="text-stone-300">—</span>
                        ) : (
                          <span className={c.confirmed >= c.need ? "text-emerald-700" : "font-medium text-red-600"}>
                            {c.confirmed}/{c.need}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
