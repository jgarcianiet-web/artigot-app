import type { Viewer } from "./auth";
import { canAccessChat } from "./chat";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { deleteObject, getObject, listObjects, putObject, storageEnabled } from "./storage";
import { isEventLead } from "./reviews";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export type Scope = "CHAT" | "INCIDENT" | "DOC" | "CANDIDATE" | "SIGNATURE" | "PHOTO" | "STAFF";

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

/** Foto del chat interno de RRHH (solo la ve RRHH). */
export async function storeStaffImage(file: File) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Solo se pueden enviar fotos (JPG, PNG, WEBP o HEIC).");
  return store(file, { scope: "STAFF" });
}

/** Foto de perfil del trabajador (la revisa RRHH). */
export async function storeProfilePhoto(file: File, workerId: string) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Sube una foto (JPG, PNG, WEBP o HEIC).");
  return store(file, { scope: "PHOTO", workerId });
}

/** CV o foto de un candidato (solo lo ve RRHH). */
export async function storeCandidateFile(file: File) {
  if (!IMAGE_TYPES.includes(file.type) && file.type !== "application/pdf") throw new Error("Adjunta tu CV en PDF o una foto.");
  return store(file, { scope: "CANDIDATE" });
}

/** Imagen de la firma de un documento (PNG generado en el navegador). */
export async function storeSignature(png: Buffer, workerId: string) {
  if (png.length === 0 || png.length > 500_000) throw new Error("Firma no válida.");
  return save(png, { scope: "SIGNATURE", workerId, mime: "image/png" });
}

async function store(file: File, opts: { eventId?: string; scope: Scope; incidentId?: string; workerId?: string }) {
  if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new Error("El archivo es demasiado grande (máximo 5 MB).");
  return save(Buffer.from(await file.arrayBuffer()), { ...opts, mime: file.type });
}

type SaveOpts = { eventId?: string; scope: Scope; incidentId?: string; workerId?: string; mime: string };

/** Guarda el contenido en el almacén de archivos (cifrado) o, si no hay almacén, en la base de datos. */
async function save(data: Buffer, opts: SaveOpts) {
  const meta = { eventId: opts.eventId, scope: opts.scope, incidentId: opts.incidentId, workerId: opts.workerId, mime: opts.mime, size: data.length };
  if (!storageEnabled()) return db.storedFile.create({ data: { ...meta, data: new Uint8Array(data) }, select: { id: true } });
  const id = randomUUID().replace(/-/g, "");
  const storageKey = `files/${id}`;
  await putObject(storageKey, data, opts.mime);
  try {
    return await db.storedFile.create({ data: { id, ...meta, storageKey }, select: { id: true } });
  } catch (e) {
    await deleteObject(storageKey).catch(() => {});
    throw e;
  }
}

/** Contenido de un archivo, esté donde esté. */
export async function readStoredFile(f: { data: Uint8Array | null; storageKey: string | null }) {
  if (f.storageKey) return getObject(f.storageKey);
  if (f.data) return Buffer.from(f.data);
  throw new Error("Archivo sin contenido");
}

/** Pasa al almacén los archivos que aún están en la base de datos (por tandas). */
export async function migrateFilesToStorage(batch = 50, maxMs = 20_000) {
  if (!storageEnabled()) return { moved: 0, remaining: await db.storedFile.count({ where: { storageKey: null } }) };
  const start = Date.now();
  let moved = 0;
  while (Date.now() - start < maxMs) {
    const files = await db.storedFile.findMany({ where: { storageKey: null, data: { not: null } }, select: { id: true, data: true, mime: true }, take: batch });
    if (!files.length) break;
    for (const f of files) {
      const storageKey = `files/${f.id}`;
      await putObject(storageKey, Buffer.from(f.data!), f.mime);
      await db.storedFile.update({ where: { id: f.id }, data: { storageKey, data: null } });
      moved++;
    }
  }
  return { moved, remaining: await db.storedFile.count({ where: { storageKey: null } }) };
}

/** Borra del almacén los archivos cuyo registro ya no existe (p. ej. al borrar un trabajador). */
export async function sweepOrphanFiles() {
  if (!storageEnabled()) return 0;
  const objects = await listObjects("files/");
  const ids = objects.map((o) => o.key.slice("files/".length));
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    for (const f of await db.storedFile.findMany({ where: { id: { in: ids.slice(i, i + 1000) } }, select: { id: true } })) existing.add(f.id);
  }
  // Solo objetos con más de un día: evita borrar uno que se esté subiendo en este momento
  const old = objects.filter((o) => !existing.has(o.key.slice(6)) && (!o.modified || Date.now() - o.modified.getTime() > 864e5));
  for (const o of old) await deleteObject(o.key);
  return old.length;
}

/**
 * Quién puede ver cada archivo:
 * - Fotos del chat: quien puede leer el chat del evento (RRHH + personal confirmado).
 * - Fotos de incidencias: RRHH y el maître / camarero responsable del evento.
 * - Documentos del trabajador: RRHH y el propio trabajador.
 */
export async function canReadFile(viewer: Viewer, file: { scope: string; eventId: string | null; workerId: string | null }) {
  if (viewer.kind === "admin") return true;
  if (file.scope === "DOC" || file.scope === "SIGNATURE" || file.scope === "PHOTO") return file.workerId === viewer.id;
  if (file.scope === "CANDIDATE" || file.scope === "STAFF") return false; // solo RRHH
  if (!file.eventId) return false;
  if (file.scope === "CHAT") return canAccessChat(viewer, file.eventId);
  if (file.scope === "INCIDENT") return isEventLead(file.eventId, viewer.id);
  return false;
}

/** Borra un archivo (registro y contenido en el almacén). */
export async function deleteStoredFile(id: string) {
  const f = await db.storedFile.delete({ where: { id }, select: { storageKey: true } }).catch(() => null);
  if (f?.storageKey && storageEnabled()) await deleteObject(f.storageKey).catch((e) => console.error("borrar archivo", id, e));
}
