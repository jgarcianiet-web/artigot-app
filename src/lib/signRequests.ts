import { after } from "next/server";
import { PDFDocument } from "pdf-lib";
import { db } from "./db";
import { deleteStoredFile, readStoredFile, storeSignDoc } from "./files";
import { notify } from "./push";
import { expiry, type ExternalInput, inviteExternal, newToken } from "./externalSign";
import { docTitle, requestDoc, requestDocs } from "./signDocs";
import { stampSignedPdf } from "./signedPdf";

/**
 * Documentos que RRHH envía a firmar (cambio de contrato, anexos, normas…): un PDF para una o varias personas.
 * Cada persona tiene su firma pendiente (Contract kind DOCUMENTO). Firma en el móvil con el dedo y su copia firmada
 * es el PDF original con «Firmado electrónicamente por…» en cada página y una hoja final con los datos de la firma
 * (quién, DNI, cuándo, desde qué IP) y la huella SHA-256 del documento original, que prueba que no se ha cambiado.
 * También se puede enviar a personas de fuera de la plataforma (ExternalSigner, ver externalSign.ts).
 */

export const SIGN_KIND = "DOCUMENTO";
export const MAX_SIGN_FILES = 10;
const MAX_TOTAL_BYTES = 35 * 1024 * 1024;

export async function createSignRequest(by: string, data: { title: string; message: string | null; files: File[]; workerIds: string[]; externals?: ExternalInput[] }) {
  const title = data.title.trim().slice(0, 120);
  if (title.length < 3) throw new Error("Pon un título al documento (p. ej. «Anexo al contrato»).");
  const workers = await db.worker.findMany({ where: { id: { in: [...new Set(data.workerIds)] }, active: true }, select: { id: true } });
  const externals = data.externals ?? [];
  if (!workers.length && !externals.length) throw new Error("Elige al menos a una persona.");
  const files = data.files.filter((f) => f.size > 0);
  if (!files.length) throw new Error("Adjunta el documento en PDF.");
  if (files.length > MAX_SIGN_FILES) throw new Error(`Como mucho ${MAX_SIGN_FILES} documentos en cada envío.`);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) throw new Error("Los documentos pesan demasiado juntos (máximo 35 MB). Divídelos en dos envíos.");
  for (const f of files) {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) throw new Error(`«${f.name}» no es un PDF: todos los documentos tienen que ser PDF.`);
    // Que cada PDF se pueda abrir (y firmar después) antes de enviarlo a nadie
    try {
      const doc = await PDFDocument.load(Buffer.from(await f.arrayBuffer()), { ignoreEncryption: true });
      if (!doc.getPageCount()) throw new Error();
    } catch {
      throw new Error(`No se puede leer «${f.name}». Comprueba que no está dañado ni protegido con contraseña.`);
    }
  }
  const stored = [];
  for (const f of files) stored.push({ id: (await storeSignDoc(f)).id, title: files.length > 1 ? docTitle(f.name) : title });
  const request = await db.signRequest.create({
    data: {
      title, message: data.message?.trim().slice(0, 2000) || null, fileId: stored[0].id, createdBy: by,
      files: { create: stored.map((f, i) => ({ fileId: f.id, title: f.title, position: i })) },
      contracts: { create: workers.map((w) => ({ kind: SIGN_KIND, workerId: w.id, title, body: data.message?.trim().slice(0, 2000) || "", createdBy: by })) },
      externals: { create: externals.map((x) => ({ name: x.name, dni: x.dni || null, email: x.email || null, phone: x.phone || null, channel: x.channel, token: newToken(), expiresAt: expiry(), createdBy: by })) },
    },
    include: { externals: true },
  });
  after(async () => {
    for (const x of request.externals) await inviteExternal(x, request).catch((e) => console.error("email firma externa", x.email, e));
  });
  if (workers.length) after(() =>
    notify({
      workerIds: workers.map((w) => w.id),
      workerUrl: "/app",
      title: "✍️ Documento para firmar",
      body: `RRHH te ha enviado «${title}»${files.length > 1 ? ` (${files.length} documentos)` : ""}. Ábrelo en la app y fírmalo.`,
      tag: `firma-${request.id}`,
      emailFallback: true,
    }),
  );
  return { request, recipients: workers.length + externals.length };
}

/**
 * Recordatorio a quien aún no ha firmado. A los de fuera se les alarga el enlace: por email se les reenvía; a los de
 * WhatsApp se lo vuelve a mandar RRHH con el botón. Devuelve a cuántos se ha avisado ya y cuántos van por WhatsApp.
 */
export async function remindSignRequest(requestId: string) {
  const pending = await db.contract.findMany({ where: { requestId, signedAt: null }, select: { workerId: true, title: true } });
  const r = await db.signRequest.findUniqueOrThrow({ where: { id: requestId }, include: { externals: { where: { signedAt: null } } } });
  for (const x of r.externals) {
    const ext = await db.externalSigner.update({ where: { id: x.id }, data: { expiresAt: expiry() } });
    await inviteExternal(ext, r, true).catch((e) => console.error("recordatorio firma externa", x.email, e));
  }
  if (pending.length)
    await notify({
      workerIds: pending.map((p) => p.workerId),
      workerUrl: "/app",
      title: "✍️ Tienes un documento sin firmar",
      body: `Falta tu firma en «${pending[0].title}». Ábrelo en la app y fírmalo.`,
      tag: `firma-${requestId}`,
      emailFallback: true,
    });
  const whatsapp = r.externals.filter((x) => x.channel === "WHATSAPP").length;
  return { notified: pending.length + r.externals.length - whatsapp, whatsapp };
}

/** Anula las firmas pendientes (las ya firmadas se quedan). Si no queda ninguna, se borra el envío y el PDF. */
export async function cancelPending(requestId: string) {
  const { count } = await db.contract.deleteMany({ where: { requestId, signedAt: null } });
  const ext = await db.externalSigner.deleteMany({ where: { requestId, signedAt: null } });
  const left = (await db.contract.count({ where: { requestId } })) + (await db.externalSigner.count({ where: { requestId } }));
  if (!left) {
    const docs = await requestDocs(requestId);
    await db.signRequest.delete({ where: { id: requestId } });
    for (const d of docs) await deleteStoredFile(d.fileId);
  }
  return { cancelled: count + ext.count, deleted: !left };
}

/** Borra el envío entero: las firmas (también las ya firmadas, con su imagen de firma) y el PDF. */
export async function deleteSignRequest(requestId: string) {
  const r = await db.signRequest.findUnique({
    where: { id: requestId },
    include: { contracts: { select: { signatureFileId: true } }, externals: { select: { signatureFileId: true } } },
  });
  if (!r) return null;
  const docs = await requestDocs(requestId);
  await db.signRequest.delete({ where: { id: requestId } }); // las firmas y la lista de documentos se borran en cascada
  const all = [...r.contracts, ...r.externals];
  for (const c of all) if (c.signatureFileId) await deleteStoredFile(c.signatureFileId);
  for (const d of docs) await deleteStoredFile(d.fileId);
  return { title: r.title, signed: all.filter((c) => c.signatureFileId).length, total: all.length };
}

/** Si ya han firmado todos (personal y de fuera), avisa a RRHH. */
export async function notifyIfAllSigned(requestId: string, title: string) {
  const [pending, total] = await Promise.all([
    Promise.all([db.contract.count({ where: { requestId, signedAt: null } }), db.externalSigner.count({ where: { requestId, signedAt: null } })]),
    Promise.all([db.contract.count({ where: { requestId } }), db.externalSigner.count({ where: { requestId } })]),
  ]);
  if (pending[0] + pending[1]) return;
  const n = total[0] + total[1];
  await notify({ admins: true, adminUrl: `/admin/documentos/firmar/${requestId}`, title: "✍️ Documento firmado por todos", body: `«${title}»: han firmado las ${n} ${n === 1 ? "persona" : "personas"}.`, tag: `firma-${requestId}` });
}

/** Un documento del envío: el original si aún no está firmado; si lo está, con la firma en cada página y la hoja de firma. */
export async function signedDocPdf(contractId: string, index = 0) {
  const c = await db.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { worker: { select: { name: true, dni: true } }, signature: { select: { data: true, storageKey: true } } },
  });
  const doc = c.requestId ? await requestDoc(c.requestId, index) : null;
  if (!doc) return null;
  if (!c.signedAt) return new Uint8Array(doc.original);
  return stampSignedPdf(doc.original, {
    id: c.id, title: doc.title, extra: doc.extra, name: c.worker.name, dni: c.worker.dni, signedAt: c.signedAt, ip: c.signerIp, note: c.signerNote,
    sentBy: c.createdBy, sentAt: c.createdAt, signature: c.signature ? await readStoredFile(c.signature) : null,
    how: "lo firmó con su firma manuscrita en la app de Artigot tras identificarse con su usuario y código personal",
  });
}
