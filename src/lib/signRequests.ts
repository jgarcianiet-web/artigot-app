import { createHash } from "node:crypto";
import { after } from "next/server";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { getCompany } from "./contracts";
import { db } from "./db";
import { deleteStoredFile, readStoredFile, storeSignDoc } from "./files";
import { notify } from "./push";

/**
 * Documentos que RRHH envía a firmar (cambio de contrato, anexos, normas…): un PDF para una o varias personas.
 * Cada persona tiene su firma pendiente (Contract kind DOCUMENTO). Firma en el móvil con el dedo y su copia firmada
 * es el PDF original con «Firmado electrónicamente por…» en cada página y una hoja final con los datos de la firma
 * (quién, DNI, cuándo, desde qué IP) y la huella SHA-256 del documento original, que prueba que no se ha cambiado.
 */

export const SIGN_KIND = "DOCUMENTO";

const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€‘’“”–—…\n]/g, "");
const when = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(d);

export async function createSignRequest(by: string, data: { title: string; message: string | null; file: File; workerIds: string[] }) {
  const title = data.title.trim().slice(0, 120);
  if (title.length < 3) throw new Error("Pon un título al documento (p. ej. «Anexo al contrato»).");
  const workers = await db.worker.findMany({ where: { id: { in: [...new Set(data.workerIds)] }, active: true }, select: { id: true } });
  if (!workers.length) throw new Error("Elige al menos a una persona.");
  if (data.file.type !== "application/pdf" && !data.file.name.toLowerCase().endsWith(".pdf")) throw new Error("El documento tiene que ser un PDF.");
  // Que el PDF se pueda abrir (y firmar después) antes de enviarlo a nadie
  try {
    const doc = await PDFDocument.load(Buffer.from(await data.file.arrayBuffer()), { ignoreEncryption: true });
    if (!doc.getPageCount()) throw new Error();
  } catch {
    throw new Error("No se puede leer el PDF. Comprueba que no está dañado ni protegido con contraseña.");
  }
  const stored = await storeSignDoc(data.file);
  const request = await db.signRequest.create({
    data: {
      title, message: data.message?.trim().slice(0, 2000) || null, fileId: stored.id, createdBy: by,
      contracts: { create: workers.map((w) => ({ kind: SIGN_KIND, workerId: w.id, title, body: data.message?.trim().slice(0, 2000) || "", createdBy: by })) },
    },
  });
  after(() =>
    notify({
      workerIds: workers.map((w) => w.id),
      workerUrl: "/app",
      title: "✍️ Documento para firmar",
      body: `RRHH te ha enviado «${title}». Ábrelo en la app y fírmalo.`,
      tag: `firma-${request.id}`,
      emailFallback: true,
    }),
  );
  return { request, recipients: workers.length };
}

/** Recordatorio a quien aún no ha firmado. Devuelve a cuántos. */
export async function remindSignRequest(requestId: string) {
  const pending = await db.contract.findMany({ where: { requestId, signedAt: null }, select: { workerId: true, title: true } });
  if (pending.length)
    await notify({
      workerIds: pending.map((p) => p.workerId),
      workerUrl: "/app",
      title: "✍️ Tienes un documento sin firmar",
      body: `Falta tu firma en «${pending[0].title}». Ábrelo en la app y fírmalo.`,
      tag: `firma-${requestId}`,
      emailFallback: true,
    });
  return pending.length;
}

/** Anula las firmas pendientes (las ya firmadas se quedan). Si no queda ninguna, se borra el envío y el PDF. */
export async function cancelPending(requestId: string) {
  const { count } = await db.contract.deleteMany({ where: { requestId, signedAt: null } });
  const left = await db.contract.count({ where: { requestId } });
  if (!left) {
    const r = await db.signRequest.delete({ where: { id: requestId } });
    await deleteStoredFile(r.fileId);
  }
  return { cancelled: count, deleted: !left };
}

/** Borra el envío entero: las firmas (también las ya firmadas, con su imagen de firma) y el PDF. */
export async function deleteSignRequest(requestId: string) {
  const r = await db.signRequest.findUnique({ where: { id: requestId }, include: { contracts: { select: { signatureFileId: true } } } });
  if (!r) return null;
  await db.signRequest.delete({ where: { id: requestId } }); // las firmas se borran en cascada
  for (const c of r.contracts) if (c.signatureFileId) await deleteStoredFile(c.signatureFileId);
  await deleteStoredFile(r.fileId);
  return { title: r.title, signed: r.contracts.filter((c) => c.signatureFileId).length, total: r.contracts.length };
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) out.push(line), (line = word);
      else line = next;
    }
    out.push(line);
  }
  return out;
}

/** El PDF del documento: el original si aún no está firmado; si lo está, con la firma en cada página y la hoja de firma. */
export async function signedDocPdf(contractId: string) {
  const c = await db.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: {
      worker: { select: { name: true, dni: true } },
      signature: { select: { data: true, storageKey: true } },
      request: { include: { file: { select: { data: true, storageKey: true } } } },
    },
  });
  const original = await readStoredFile(c.request!.file);
  if (!c.signedAt) return new Uint8Array(original);
  const hash = createHash("sha256").update(original).digest("hex");
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.35, 0.35, 0.35);
  const stamp = safe(`Firmado electrónicamente por ${c.worker.name}${c.worker.dni ? ` (${c.worker.dni})` : ""} el ${when(c.signedAt)} · ref. ${c.id}`);
  for (const page of pdf.getPages()) {
    const { width } = page.getSize();
    let size = 7;
    while (size > 5 && font.widthOfTextAtSize(stamp, size) > width - 40) size -= 0.5;
    page.drawText(stamp, { x: 20, y: 12, size, font, color: grey });
  }
  // Hoja de firma
  const [W, H, M] = [595, 842, 56];
  const page = pdf.addPage([W, H]);
  let y = H - M;
  const line = (text: string, f = font, size = 10.5, color = rgb(0.1, 0.1, 0.1)) => {
    for (const l of wrap(text, f, size, W - 2 * M)) {
      page.drawText(l, { x: M, y, size, font: f, color });
      y -= size + 5;
    }
  };
  const company = await getCompany();
  line("Hoja de firma electrónica", bold, 16);
  y -= 6;
  line(c.title, bold, 12);
  line(`Empresa: ${company.name || "Artigot Catering"}${company.cif ? ` · CIF ${company.cif}` : ""}`, font, 10, grey);
  y -= 10;
  const rows: [string, string][] = [
    ["Firmante", c.worker.name],
    ["DNI / NIE", c.worker.dni ?? "—"],
    ["Fecha y hora de la firma", `${when(c.signedAt)} (hora de Madrid)`],
    ["Dirección IP", c.signerIp ?? "—"],
    ["Enviado por", `${c.createdBy} (RRHH) el ${when(c.createdAt)}`],
    ["Referencia", c.id],
    ["Huella SHA-256 del documento original", hash],
  ];
  for (const [k, v] of rows) {
    line(k, bold, 9.5, grey);
    line(v, font, k.startsWith("Huella") ? 8.5 : 11);
    y -= 4;
  }
  if (c.signerNote) {
    line("Observaciones del firmante", bold, 9.5, grey);
    line(c.signerNote, font, 11);
    y -= 4;
  }
  y -= 8;
  line("Firma", bold, 9.5, grey);
  if (c.signature) {
    const sig = await pdf.embedPng(await readStoredFile(c.signature));
    const scale = Math.min(240 / sig.width, 110 / sig.height);
    const [w, h] = [sig.width * scale, sig.height * scale];
    page.drawRectangle({ x: M, y: y - h - 8, width: 260, height: h + 16, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.8 });
    page.drawImage(sig, { x: M + 10, y: y - h, width: w, height: h });
    y -= h + 30;
  }
  line(
    "El firmante declaró haber leído el documento y estar conforme, y lo firmó con su firma manuscrita en la app de Artigot tras identificarse con su usuario y código personal. La huella SHA-256 permite comprobar que el documento firmado es exactamente el que se le envió.",
    font,
    9,
    grey,
  );
  pdf.setTitle(safe(`${c.title} · ${c.worker.name} · firmado`));
  return pdf.save();
}
