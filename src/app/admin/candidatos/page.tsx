import Link from "next/link";
import { Empty, RoleBadge } from "@/components/ui";
import { APPLY_ROLES, CANDIDATE_STATUS, OPEN_STATUSES } from "@/lib/candidates";
import type { Prisma } from "@prisma/client";
import { ROLE_LABEL } from "@/lib/domain";
import { requestUrl } from "@/lib/requestUrl";
import { db } from "@/lib/db";
import { CopyButton } from "@/components/client";

const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short" });

const interview = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Search = { estado?: string; q?: string; puesto?: string; coche?: string };

export default async function Candidates({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { estado = "abiertos", q = "", puesto = "", coche = "" } = sp;
  const text = q.trim();
  const digits = text.replace(/\D/g, "");
  const where: Prisma.CandidateWhereInput = {
    ...(estado === "abiertos" ? { status: { in: OPEN_STATUSES } } : estado in CANDIDATE_STATUS ? { status: estado } : {}),
    ...(text && {
      OR: [
        { name: { contains: text, mode: "insensitive" } },
        { zone: { contains: text, mode: "insensitive" } },
        { email: { contains: text, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phoneKey: { contains: digits } }] : []),
      ],
    }),
    ...(puesto && { roles: { has: puesto } }),
    ...(coche === "1" && { hasCar: true }),
  };
  const [candidates, counts] = await Promise.all([
    db.candidate.findMany({
      where,
      // Las entrevistas, por fecha (las próximas primero); el resto, lo más reciente arriba
      orderBy: estado === "ENTREVISTA" ? [{ interviewAt: { sort: "asc", nulls: "last" } }] : { createdAt: "desc" },
      take: 300,
    }),
    db.candidate.groupBy({ by: ["status"], _count: true }),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const tabs = [
    ["abiertos", `Por revisar (${OPEN_STATUSES.reduce((s, x) => s + n(x), 0)})`],
    ["ENTREVISTA", `Entrevistas (${n("ENTREVISTA")})`],
    ["CONTRATADO", `Dados de alta (${n("CONTRATADO")})`],
    ["DESCARTADO", `Descartados (${n("DESCARTADO")})`],
    ["todos", "Todos"],
  ];
  const link = `${await requestUrl()}/trabaja-con-nosotros`;
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
          <Link key={k} href={`/admin/candidatos?${new URLSearchParams({ ...sp, estado: k })}`} className={`rounded-md px-3 py-1.5 ${estado === k ? "bg-brand-100 font-medium text-brand-900" : "hover:bg-stone-100"}`}>{l}</Link>
        ))}
      </div>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="estado" value={estado} />
        <input name="q" defaultValue={q} placeholder="Buscar nombre, teléfono, zona…" className="input w-64" aria-label="Buscar" />
        <select name="puesto" defaultValue={puesto} className="input w-auto" aria-label="Puesto">
          <option value="">Todos los puestos</option>
          {APPLY_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" name="coche" value="1" defaultChecked={coche === "1"} className="size-4" /> Con coche</label>
        <button className="btn btn-sm">Filtrar</button>
        {(q || puesto || coche) && <Link href={`/admin/candidatos?estado=${estado}`} className="pb-2 text-stone-500 hover:underline">Quitar filtros</Link>}
      </form>
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
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${CANDIDATE_STATUS[c.status].cls}`}>{CANDIDATE_STATUS[c.status].label}</span>
                    {c.interviewAt && c.status === "ENTREVISTA" && <div className="mt-0.5 whitespace-nowrap text-xs text-violet-800">📅 {interview.format(c.interviewAt)}</div>}
                    {c.rating && <div className="text-xs text-amber-600" title="Valoración tras la entrevista">{"★".repeat(c.rating)}</div>}
                  </td>
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
