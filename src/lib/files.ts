import type { Viewer } from "./auth";
import { canAccessChat } from "./chat";
import { db } from "./db";
import { isEventLead } from "./reviews";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export type Scope = "CHAT" | "INCIDENT" | "DOC" | "CANDIDATE" | "SIGNATURE";

/** Guarda una imagen subida (las fotos se reducen en el móvil antes de enviarlas). */
export async function storeImage(file: File, opts: { eventId: string; scope: Scope; incidentId?: string }) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Solo se pueden subir fotos (JPG, PNG, WEBP o HEIC).");
  return store(file, { eventId: opts.eventId, scope: opts.scope, incidentId: opts.incidentId });
}

/** Documento de un trabajador: foto o PDF. */
export async function storeDocument(file: File, workerId: string) {
  if (!IMAGE_TYPES.includes(file.type) && file.type !== "application/pdf") throw new Error("Sube una foto o un PDF.");
  return store(file, { scope: "DOC", workerId });
}

/** CV o foto de un candidato (solo lo ve RRHH). */
export async function storeCandidateFile(file: File) {
  if (!IMAGE_TYPES.includes(file.type) && file.type !== "application/pdf") throw new Error("Adjunta tu CV en PDF o una foto.");
  return store(file, { scope: "CANDIDATE" });
}

/** Imagen de la firma de un documento (PNG generado en el navegador). */
export async function storeSignature(png: Buffer, workerId: string) {
  if (png.length === 0 || png.length > 500_000) throw new Error("Firma no válida.");
  return db.storedFile.create({ data: { scope: "SIGNATURE", workerId, mime: "image/png", size: png.length, data: new Uint8Array(png) }, select: { id: true } });
}

async function store(file: File, opts: { eventId?: string; scope: Scope; incidentId?: string; workerId?: string }) {
  if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new Error("El archivo es demasiado grande (máximo 5 MB).");
  return db.storedFile.create({
    data: {
      eventId: opts.eventId,
      scope: opts.scope,
      incidentId: opts.incidentId,
      workerId: opts.workerId,
      mime: file.type,
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
    },
    select: { id: true },
  });
}

/**
 * Quién puede ver cada archivo:
 * - Fotos del chat: quien puede leer el chat del evento (RRHH + personal confirmado).
 * - Fotos de incidencias: RRHH y el maître / camarero responsable del evento.
 * - Documentos del trabajador: RRHH y el propio trabajador.
 */
export async function canReadFile(viewer: Viewer, file: { scope: string; eventId: string | null; workerId: string | null }) {
  if (viewer.kind === "admin") return true;
  if (file.scope === "DOC" || file.scope === "SIGNATURE") return file.workerId === viewer.id;
  if (file.scope === "CANDIDATE") return false; // solo RRHH
  if (!file.eventId) return false;
  if (file.scope === "CHAT") return canAccessChat(viewer, file.eventId);
  if (file.scope === "INCIDENT") return isEventLead(file.eventId, viewer.id);
  return false;
}
