import { notFound } from "next/navigation";
import { PrintButton } from "@/components/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, isLeadRole, ROLE_LABEL, type Role } from "@/lib/domain";

/** Hoja para imprimir o mandar a cada maître: un grupo por página con su hora y su gente. */
export default async function GroupSheet({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const event = await db.event.findUnique({
    where: { id: (await params).id },
    include: {
      groups: { orderBy: { position: "asc" } },
      assignments: { where: { status: "CONFIRMADO" }, include: { worker: { select: { name: true, phone: true } } }, orderBy: { worker: { name: "asc" } } },
    },
  });
  if (!event) notFound();
  const sections = [
    ...event.groups.map((g) => ({ key: g.id, name: g.name, time: g.callTime ?? event.startTime, people: event.assignments.filter((a) => a.groupId === g.id) })),
    { key: "sin", name: "Maître general y sin grupo", time: event.startTime, people: event.assignments.filter((a) => !a.groupId && a.role !== "MOZO") },
    { key: "mozos", name: "Mozos", time: event.unloadTime ?? event.startTime, people: event.assignments.filter((a) => a.role === "MOZO") },
  ].filter((s) => s.people.length);
  const sort = (a: { role: string; worker: { name: string } }, b: { role: string; worker: { name: string } }) =>
    (isLeadRole(a.role) ? 0 : 1) - (isLeadRole(b.role) ? 0 : 1) || a.worker.name.localeCompare(b.worker.name, "es");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1>Hoja por grupos</h1>
        <PrintButton />
      </div>
      {sections.map((s) => (
        <section key={s.key} className="card break-after-page space-y-2 print:border-0 print:shadow-none">
          <div className="text-sm text-stone-500">
            {event.name} · <span className="first-letter:uppercase">{formatDate(event.date, { long: true })}</span> · {event.venue}
          </div>
          <h2 className="text-xl">
            {s.name} · entrada {s.time} <span className="text-base font-normal text-stone-500">({s.people.length} personas)</span>
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Nombre</th>
                <th>Puesto</th>
                <th>Teléfono</th>
                <th className="w-24">Llegada</th>
              </tr>
            </thead>
            <tbody>
              {s.people.sort(sort).map((a, i) => (
                <tr key={a.id} className={isLeadRole(a.role) ? "font-semibold" : ""}>
                  <td>{i + 1}</td>
                  <td>{a.worker.name}</td>
                  <td>{ROLE_LABEL[a.role as Role]}</td>
                  <td>{a.worker.phone}</td>
                  <td className="border-b border-stone-300" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {sections.length === 0 && <p className="text-sm text-stone-500">No hay personal confirmado todavía.</p>}
    </div>
  );
}
