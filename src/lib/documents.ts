import { db } from "./db";
import { storeDocument } from "./files";
import { DOC_TYPES } from "./staff";

/** Añade un documento (con archivo opcional) a un trabajador. uploadedBy = nombre de quien lo sube. */
export async function addDocument(workerId: string, form: FormData, uploadedBy: string, verified = false) {
  const type = String(form.get("type") ?? "");
  const label = String(form.get("label") ?? "").trim().slice(0, 100) || null;
  const expiresAt = String(form.get("expiresAt") ?? "") || null;
  const file = form.get("file");
  if (!(DOC_TYPES as readonly string[]).includes(type)) return { ok: false, message: "Elige el tipo de documento." };
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return { ok: false, message: "Fecha de caducidad no válida." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Adjunta una foto o un PDF del documento." };
  let fileId: string;
  try {
    fileId = (await storeDocument(file, workerId)).id;
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  await db.workerDocument.create({ data: { workerId, type, label, expiresAt, fileId, uploadedBy, verified } });
  return { ok: true, message: "Documento subido. RRHH lo revisará." };
}
