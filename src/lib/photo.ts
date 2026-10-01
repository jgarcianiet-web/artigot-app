import { after } from "next/server";
import { auditAdmin, audit } from "./audit";
import { db } from "./db";
import { deleteStoredFile, storeProfilePhoto } from "./files";
import { mailEnabled, sendMail } from "./mail";
import { notify } from "./push";

/**
 * Foto de perfil obligatoria: el trabajador la sube desde la app y RRHH la acepta o la rechaza
 * (con el motivo, y se le avisa para que suba otra). Mientras no esté aceptada cuenta como dato
 * pendiente.
 */

export const PHOTO_REJECT_REASONS = [
  "No se te ve bien la cara",
  "Está borrosa o muy oscura",
  "Con gafas de sol, gorra o filtros",
  "No es una foto tuya",
  "Busca un fondo neutro y de frente",
];

export const PHOTO_STATUS: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: "Pendiente de revisar", cls: "bg-amber-100 text-amber-900" },
  ACEPTADA: { label: "Aceptada", cls: "bg-emerald-100 text-emerald-800" },
  RECHAZADA: { label: "Rechazada", cls: "bg-red-100 text-red-700" },
};

export async function uploadPhoto(workerId: string, file: File, by: { name: string; admin: boolean }) {
  const before = await db.worker.findUniqueOrThrow({ where: { id: workerId }, select: { name: true, photoFileId: true } });
  const stored = await storeProfilePhoto(file, workerId);
  // Si la sube RRHH, queda aceptada directamente
  await db.worker.update({ where: { id: workerId }, data: { photoFileId: stored.id, photoStatus: by.admin ? "ACEPTADA" : "PENDIENTE", photoNote: null } });
  if (before.photoFileId) await deleteStoredFile(before.photoFileId);
  if (by.admin) await auditAdmin(by.name, "Trabajador", "Foto de perfil subida", `${before.name}: foto de perfil subida por RRHH`, { entityId: workerId });
  else await audit(by.name, "Trabajador", "Trabajador", "Foto de perfil subida", `${before.name}: foto de perfil para revisar`, { entityId: workerId });
}

export async function reviewPhoto(workerId: string, accept: boolean, reason: string | null, by: string) {
  const w = await db.worker.findUniqueOrThrow({ where: { id: workerId }, select: { name: true, email: true, photoFileId: true, _count: { select: { devices: true } } } });
  if (!w.photoFileId) return;
  if (accept) {
    await db.worker.update({ where: { id: workerId }, data: { photoStatus: "ACEPTADA", photoNote: null } });
    await auditAdmin(by, "Trabajador", "Foto de perfil aceptada", `${w.name}: foto de perfil aceptada`, { entityId: workerId });
    return;
  }
  const note = reason?.trim() || "No es válida";
  await db.worker.update({ where: { id: workerId }, data: { photoStatus: "RECHAZADA", photoNote: note, photoFileId: null } });
  await deleteStoredFile(w.photoFileId);
  await auditAdmin(by, "Trabajador", "Foto de perfil rechazada", `${w.name}: foto de perfil rechazada (${note})`, { entityId: workerId });
  const body = `Tu foto de perfil no vale: ${note}. Sube otra desde tu perfil en la app.`;
  after(async () => {
    await notify({ workerIds: [workerId], workerUrl: "/app/perfil#foto", title: "Sube otra foto de perfil", body, tag: "foto" });
    if (!w._count.devices && w.email && mailEnabled()) await sendMail(w.email, "Sube otra foto de perfil", body).catch((e) => console.error("email foto", e));
  });
}

export const pendingPhotos = () => db.worker.count({ where: { active: true, photoStatus: "PENDIENTE", photoFileId: { not: null } } });
