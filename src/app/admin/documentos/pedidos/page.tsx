import Link from "next/link";
import { cancelDocRequest, remindDocRequest } from "@/app/actions";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { Empty } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { requestTitle } from "@/lib/docRequests";
import { DOC_LABEL } from "@/lib/staff";
import { DocTabs } from "../DocTabs";

const day = (d: Date) => formatDate(d.toISOString().slice(0, 10));

/** Documentos pedidos al personal: quién falta por subirlo, quién lo ha subido (por revisar) y lo ya aprobado. */
export default async function DocRequests({ searchParams }: { searchParams: Promise<{ ok?: string; ya?: string; ver?: string }> }) {
  await requireAdmin();
  const { ok, ya, ver } = await searchParams;
  const done = ver === "aprobados";
  const requests = await db.docRequest.findMany({
    where: done ? { status: "APROBADO" } : { status: { in: ["PENDIENTE", "ENTREGADO"] }, worker: { active: true } },
    include: { worker: { select: { id: true, name: true } } },
    orderBy: done ? { reviewedAt: "desc" } : { createdAt: "asc" },
    take: done ? 200 : undefined,
  });
  // Agrupadas por documento pedido
  const groups = new Map<string, typeof requests>();
  for (const r of requests) {
    const key = `${r.type}|${r.label ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>Documentos</h1>
        <Link href="/admin/documentos/pedidos/nuevo" className="btn btn-primary">+ Pedir documento</Link>
      </div>
      <DocTabs active="pedidos" />
      {ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Pedido a {ok} {ok === "1" ? "persona" : "personas"}: les ha llegado un aviso para que lo suban desde la app.
          {ya && ` ${ya} ya lo tenían pedido.`}
        </p>
      )}
      <nav className="flex gap-3 text-sm">
        <Link href="/admin/documentos/pedidos" className={done ? "link" : "font-semibold"}>Abiertos</Link>
        <Link href="/admin/documentos/pedidos?ver=aprobados" className={done ? "font-semibold" : "link"}>Aprobados</Link>
      </nav>

      {requests.length === 0 ? (
        <Empty>{done ? "Aún no hay documentos pedidos aprobados." : "No hay documentos pedidos pendientes. Pide uno con «+ Pedir documento» o desde la ficha de cada persona."}</Empty>
      ) : (
        [...groups.values()].map((rs) => {
          const pending = rs.filter((r) => r.status === "PENDIENTE").length;
          const uploaded = rs.filter((r) => r.status === "ENTREGADO").length;
          return (
            <section key={`${rs[0].type}|${rs[0].label}`} className="card space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2>{requestTitle(rs[0])}{rs[0].label && <span className="ml-2 text-sm font-normal text-stone-500">{DOC_LABEL[rs[0].type]}</span>}</h2>
                {!done && (
                  <span className="text-sm text-stone-600">
                    {pending > 0 && <span className="text-amber-700">{pending} sin subir</span>}
                    {pending > 0 && uploaded > 0 && " · "}
                    {uploaded > 0 && <Link href="/admin/documentos" className="link">{uploaded} por revisar</Link>}
                  </span>
                )}
              </div>
              <ul className="divide-y divide-stone-100 text-sm">
                {rs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/personal/${r.worker.id}`} className="link font-medium">{r.worker.name}</Link>
                      <div className="text-xs text-stone-500">
                        {r.status === "APROBADO" ? (
                          <span className="text-emerald-700">✓ Aprobado{r.reviewedAt && ` el ${day(r.reviewedAt)}`}</span>
                        ) : r.status === "ENTREGADO" ? (
                          <span className="font-medium text-amber-800">Subido{r.uploadedAt && ` el ${day(r.uploadedAt)}`}, por revisar</span>
                        ) : r.rejectReason ? (
                          <span className="text-red-700">Rechazado ({r.rejectReason}): falta que lo suba de nuevo</span>
                        ) : (
                          "Sin subir"
                        )}
                        {" · "}pedido el {day(r.createdAt)} por {r.requestedBy}
                      </div>
                    </div>
                    {r.status === "PENDIENTE" && (
                      <form action={remindDocRequest.bind(null, r.id)}><SubmitButton className="btn btn-sm">Recordar</SubmitButton></form>
                    )}
                    {r.status === "ENTREGADO" && <Link href="/admin/documentos" className="btn btn-sm">Revisar</Link>}
                    {r.status === "APROBADO" && r.documentId && <a href={`/admin/personal/${r.worker.id}`} className="btn btn-sm">Ver ficha</a>}
                    {r.status !== "APROBADO" && (
                      <form action={cancelDocRequest.bind(null, r.id)}>
                        <ConfirmButton className="btn btn-sm btn-danger" message="¿Anular esta petición? Ya no le aparecerá en la app.">Anular</ConfirmButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
