import Link from "next/link";
import { Empty, RoleBadge } from "@/components/ui";
import { CANDIDATE_STATUS } from "@/lib/candidates";
import { appUrl } from "@/lib/domain";
import { db } from "@/lib/db";
import { CopyButton } from "@/components/client";

const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short" });

export default async function Candidates({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado = "abiertos" } = await searchParams;
  const where =
    estado === "abiertos" ? { status: { in: ["NUEVO", "CONTACTADO"] } } : estado in CANDIDATE_STATUS ? { status: estado } : {};
  const [candidates, counts] = await Promise.all([
    db.candidate.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 }),
    db.candidate.groupBy({ by: ["status"], _count: true }),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const tabs = [
    ["abiertos", `Por revisar (${n("NUEVO") + n("CONTACTADO")})`],
    ["CONTRATADO", `Dados de alta (${n("CONTRATADO")})`],
    ["DESCARTADO", `Descartados (${n("DESCARTADO")})`],
    ["todos", "Todos"],
  ];
  const link = `${appUrl()}/trabaja-con-nosotros`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1>Candidatos</h1>
          <p className="text-sm text-stone-500">Personas que se han apuntado desde el formulario público.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <code className="rounded bg-stone-100 px-2 py-1 text-xs">{link}</code>
          <CopyButton text={link} label="Copiar enlace" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-sm">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/admin/candidatos?estado=${k}`} className={`rounded-md px-3 py-1.5 ${estado === k ? "bg-brand-100 font-medium text-brand-900" : "hover:bg-stone-100"}`}>{l}</Link>
        ))}
      </div>
      {candidates.length === 0 ? (
        <Empty>No hay candidatos en esta lista. Comparte el enlace del formulario en redes o en vuestra web.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Puestos</th>
                <th>Zona</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className={c.seenAt ? "" : "bg-amber-50/60"}>
                  <td>
                    {!c.seenAt && <span className="mr-1.5 inline-block size-2 rounded-full bg-amber-500 align-middle" title="Nuevo: aún no lo ha abierto nadie" />}
                    <Link href={`/admin/candidatos/${c.id}`} className={`link ${c.seenAt ? "" : "font-semibold"}`}>{c.name}</Link>{c.fileId && <span className="ml-1 text-xs text-stone-500">📎 CV</span>}</td>
                  <td className="space-x-1">{c.roles.map((r) => <RoleBadge key={r} role={r} />)}</td>
                  <td className="text-stone-500">{c.zone}{c.hasCar && <span className="ml-1" title="Tiene coche">🚗</span>}</td>
                  <td className="whitespace-nowrap"><a href={`tel:${c.phone}`}>{c.phone}</a></td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${CANDIDATE_STATUS[c.status].cls}`}>{CANDIDATE_STATUS[c.status].label}</span></td>
                  <td className="whitespace-nowrap text-stone-500">{when.format(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
