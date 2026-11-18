import { db } from "./db";
import { notify } from "./push";
import { DOC_LABEL, DOC_TYPES } from "./staff";

/**
 * Documentos que RRHH pide al personal. El trabajador lo sube en la propia petición (queda «Entregado») y RRHH lo
 * revisa desde Documentos → Por revisar: si lo da por bueno, la petición queda «Aprobada»; si lo rechaza, vuelve a
 * «Pendiente» con el motivo y se le avisa para que lo suba de nuevo.
 */

export const OPEN = ["PENDIENTE", "ENTREGADO"];
export const REQUEST_STATUS: Record<string, string> = {
  PENDIENTE: "Pendiente de subir",
  ENTREGADO: "Subido, por revisar",
  APROBADO: "Aprobado",
  ANULADO: "Anulado",
};

export const requestTitle = (r: { type: string; label: string | null }) => r.label || DOC_LABEL[r.type] || "Documento";

export function parseRequest(form: FormData) {
  const type = String(form.get("type") ?? "");
  const label = String(form.get("label") ?? "").trim().slice(0, 100) || null;
  const message = String(form.get("message") ?? "").trim().slice(0, 1000) || null;
  if (!(DOC_TYPES as readonly string[]).includes(type)) return { error: "Elige el tipo de documento." } as const;
  if (type === "OTRO" && !label) return { error: "Escribe qué documento necesitas." } as const;
  return { type, label, message } as const;
}

/** Crea la petición para cada persona (salvo a quien ya tenga abierta la misma) y le avisa. Devuelve cuántas se han creado. */
export async function createDocRequests(workerIds: string[], req: { type: string; label: string | null; message: string | null }, by: string) {
  const open = await db.docRequest.findMany({
    where: { workerId: { in: workerIds }, type: req.type, label: req.label, status: { in: OPEN } },
    select: { workerId: true },
  });
  const skip = new Set(open.map((r) => r.workerId));
  const ids = workerIds.filter((id) => !skip.has(id));
  if (!ids.length) return { created: 0, skipped: skip.size };
  await db.docRequest.createMany({ data: ids.map((workerId) => ({ workerId, ...req, requestedBy: by })) });
  const title = requestTitle(req);
  await notify({
    workerIds: ids,
    workerUrl: "/app/perfil#pedidos",
    title: "📎 RRHH te pide un documento",
    body: `${title}. Súbelo desde la app (foto o PDF).${req.message ? ` ${req.message}` : ""}`,
    tag: "doc-pedido",
    emailFallback: true,
  }).catch((e) => console.error("aviso documento pedido", e));
  return { created: ids.length, skipped: skip.size };
}

/** Los documentos dados por buenos cierran su petición. */
export async function approveRequests(documentIds: string[]) {
  if (!documentIds.length) return;
  await db.docRequest.updateMany({ where: { documentId: { in: documentIds }, status: "ENTREGADO" }, data: { status: "APROBADO", reviewedAt: new Date() } });
}

/** El documento de una petición se ha rechazado o borrado: la petición vuelve a quedar pendiente (con el motivo, si lo hay). */
export async function reopenRequest(documentId: string, reason: string | null) {
  const r = await db.docRequest.findUnique({ where: { documentId } });
  if (!r || r.status === "ANULADO") return null;
  return db.docRequest.update({
    where: { id: r.id },
    data: { status: "PENDIENTE", documentId: null, rejectReason: reason, uploadedAt: null, reviewedAt: reason ? new Date() : r.reviewedAt },
  });
}
