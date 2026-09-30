import Link from "next/link";
import { reopenIncident, resolveIncident } from "@/app/actions";
import { IncidentList } from "@/components/IncidentList";
import { db } from "@/lib/db";

export default async function Incidents({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const all = !!(await searchParams).todas;
  const incidents = await db.incident.findMany({
    where: all ? {} : { resolved: false },
    include: {
      reporter: { select: { name: true } },
      worker: { select: { name: true } },
      photos: { select: { id: true } },
      event: { select: { id: true, name: true, date: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>Incidencias</h1>
        <div className="flex gap-1 text-sm">
          <Link href="/admin/incidencias" className={`rounded-md px-3 py-1.5 ${!all ? "bg-brand-100 font-medium text-brand-900" : "hover:bg-stone-100"}`}>Abiertas</Link>
          <Link href="/admin/incidencias?todas=1" className={`rounded-md px-3 py-1.5 ${all ? "bg-brand-100 font-medium text-brand-900" : "hover:bg-stone-100"}`}>Todas</Link>
        </div>
      </div>
      <div className="max-w-3xl">
        <IncidentList incidents={incidents} resolveAction={resolveIncident} reopenAction={reopenIncident} />
      </div>
    </div>
  );
}
