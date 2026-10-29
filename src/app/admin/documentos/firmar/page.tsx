import Link from "next/link";
import { Empty } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { DocTabs } from "../DocTabs";

const when = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", year: "numeric" }).format(d);

/** Documentos enviados a firmar al personal, con cuántos han firmado. */
export default async function SignRequests() {
  await requireAdmin();
  const requests = await db.signRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { contracts: { select: { signedAt: true } } },
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Documentos</h1>
          <p className="text-sm text-stone-500">Envía un PDF (cambio de contrato, anexo, normas…) a una o varias personas para que lo firmen en la app.</p>
        </div>
        <Link href="/admin/documentos/firmar/nuevo" className="btn btn-primary">+ Enviar documento para firmar</Link>
      </div>
      <DocTabs active="firmar" />
      {requests.length === 0 ? (
        <Empty>Aún no has enviado documentos para firmar.</Empty>
      ) : (
        <ul className="card divide-y divide-stone-100 p-0">
          {requests.map((r) => {
            const signed = r.contracts.filter((c) => c.signedAt).length;
            const total = r.contracts.length;
            return (
              <li key={r.id}>
                <Link href={`/admin/documentos/firmar/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-stone-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block text-xs text-stone-500">Enviado el {when(r.createdAt)} por {r.createdBy}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-sm ${signed === total ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                    {signed === total ? "✓ " : ""}{signed}/{total} firmados
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
