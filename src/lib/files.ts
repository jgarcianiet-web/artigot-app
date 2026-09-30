import type { Viewer } from "./auth";
import { canAccessChat } from "./chat";
import { db } from "./db";
import { isEventLead } from "./reviews";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export type Scope = "CHAT" | "INCIDENT";

/** Guarda una imagen subida (las fotos se reducen en el móvil antes de enviarlas). */
export async function storeImage(file: File, opts: { eventId: string; scope: Scope; incidentId?: string }) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Solo se pueden subir fotos (JPG, PNG, WEBP o HEIC).");
  if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new Error("La foto es demasiado grande (máximo 5 MB).");
  return db.storedFile.create({
    data: {
      eventId: opts.eventId,
      scope: opts.scope,
      incidentId: opts.incidentId,
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
 */
export async function canReadFile(viewer: Viewer, file: { scope: string; eventId: string | null }) {
  if (viewer.kind === "admin") return true;
  if (!file.eventId) return false;
  if (file.scope === "CHAT") return canAccessChat(viewer, file.eventId);
  if (file.scope === "INCIDENT") return isEventLead(file.eventId, viewer.id);
  return false;
}
