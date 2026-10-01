import Link from "next/link";
import { rejectDocument, verifyAllDocuments, verifyDocument } from "@/app/actions";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { addDays, formatDate, today } from "@/lib/domain";
import { DOC_LABEL, DOC_WARN_DAYS } from "@/lib/staff";

const REASONS = ["Se ve borroso o cortado", "Falta una de las caras", "Está caducado", "No corresponde a esta persona", "No es el documento pedido"];
const when = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function Documents({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const view = (await searchParams).ver === "caducan" ? "caducan" : "revisar";
  const t = today();
  const [pending, expiring, pendingCount, expiringCount] = await Promise.all([
    view === "revisar"
      ? db.workerDocument.findMany({
          where: { verified: false, worker: { active: true } },
          include: { worker: { select: { id: true, name: true, dni: true } }, file: { select: { id: true, mime: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [],
    view === "caducan"
      ? db.workerDocument.findMany({
          where: { expiresAt: { not: null, lte: addDays(t, DOC_WARN_DAYS) }, worker: { active: true } },
          include: { worker: { select: { id: true, name: true } } },
          orderBy: { expiresAt: "asc" },
        })
      : [],
    db.workerDocument.count({ where: { verified: false, worker: { active: true } } }),
    db.workerDocument.count({ where: { expiresAt: { not: null, lte: addDays(t, DOC_WARN_DAYS) }, worker: { active: true } } }),
  ]);
  const byWorker = new Map<string, typeof pending>();
  for (const d of pending) byWorker.set(d.workerId, [...(byWorker.get(d.workerId) ?? []), d]);

  return (
    <div className="space-y-4">
      <div>
        <h1>Documentos</h1>
        <p className="text-sm text-stone-500">Revisa lo que sube el personal. Si un documento no vale, recházalo indicando el motivo: se le avisa para que lo suba de nuevo.</p>
      </div>
      <nav className="flex gap-1 text-sm">
        <Link href="/admin/documentos" className={`rounded-md px-3 py-1.5 ${view === "revisar" ? "bg-stone-900 text-white" : "bg-stone-100 hover:bg-stone-200"}`}>Por revisar ({pendingCount})</Link>
        <Link href="/admin/documentos?ver=caducan" className={`rounded-md px-3 py-1.5 ${view === "caducan" ? "bg-stone-900 text-white" : "bg-stone-100 hover:bg-stone-200"}`}>Caducados o a punto ({expiringCount})</Link>
      </nav>

      {view === "revisar" && (byWorker.size === 0 ? <Empty>No hay documentos por revisar. 👍</Empty> : (
        <div className="space-y-4">
          {[...byWorker.values()].map((docs) => (
            <section key={docs[0].workerId} className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base">
                  <Link href={`/admin/personal/${docs[0].worker.id}`} className="link">{docs[0].worker.name}</Link>
                  {docs[0].worker.dni && <span className="ml-2 text-sm font-normal text-stone-500">{docs[0].worker.dni}</span>}
                </h2>
                {docs.length > 1 && <form action={verifyAllDocuments.bind(null, docs[0].workerId)}><button className="btn btn-sm">✓ Todos correctos ({docs.length})</button></form>}
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {docs.map((d) => (
                  <li key={d.id} className="space-y-2 rounded-lg border border-stone-200 p-3">
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <span><b>{DOC_LABEL[d.type] ?? d.type}</b>{d.label && ` · ${d.label}`}<span className="block text-xs text-stone-500">Subido {when(d.createdAt)} por {d.uploadedBy}{d.expiresAt && ` · caduca ${formatDate(d.expiresAt)}`}</span></span>
                    </div>
                    {d.file && (d.file.mime.startsWith("image/") ? (
                      <a href={`/api/files/${d.file.id}`} target="_blank"><img src={`/api/files/${d.file.id}`} alt={DOC_LABEL[d.type]} className="max-h-48 w-full rounded border object-contain" loading="lazy" /></a>
                    ) : (
                      <a href={`/api/files/${d.file.id}`} target="_blank" className="btn btn-sm">📄 Abrir PDF</a>
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={verifyDocument.bind(null, d.id)}><button className="btn btn-sm btn-success">✓ Correcto</button></form>
                      <form action={rejectDocument.bind(null, d.id)} className="flex flex-1 items-center gap-1">
                        <select name="reason" className="input py-1 text-xs" aria-label="Motivo del rechazo" defaultValue={REASONS[0]}>
                          {REASONS.map((r) => <option key={r}>{r}</option>)}
                        </select>
                        <button className="btn btn-sm btn-danger">Rechazar</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ))}

      {view === "caducan" && (expiring.length === 0 ? <Empty>No hay documentos caducados ni a punto de caducar.</Empty> : (
        <ul className="card divide-y p-0 text-sm">
          {expiring.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <span><Link href={`/admin/personal/${d.worker.id}`} className="link">{d.worker.name}</Link> · {DOC_LABEL[d.type] ?? d.type}</span>
              <span className={d.expiresAt! < t ? "font-medium text-red-700" : "text-amber-700"}>{d.expiresAt! < t ? "Caducado el" : "Caduca el"} {formatDate(d.expiresAt!)}</span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
