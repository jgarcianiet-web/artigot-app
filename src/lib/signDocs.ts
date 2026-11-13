import { db } from "./db";
import { readStoredFile } from "./files";

/** Documentos de un envío a firmar: un envío puede llevar varios PDF, que se firman de una vez y salen firmados por separado. */

/** «Anexo_2_Entrega_EPIs.pdf» → «Anexo 2 Entrega EPIs» */
export const docTitle = (fileName: string) => fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Documento";

/** Los documentos de un envío, en orden. */
export const requestDocs = (requestId: string) =>
  db.signRequestFile.findMany({ where: { requestId }, orderBy: { position: "asc" }, select: { id: true, title: true, fileId: true } });

/** Título de cada documento: si el envío tiene uno solo, el del envío. */
export const docLabel = (doc: { title: string }, request: { title: string }, count: number) => (count > 1 ? doc.title : request.title);

/** Un documento de un envío (por su posición) con su original y el título que lleva en la hoja de firma. */
export async function requestDoc(requestId: string, index: number) {
  const docs = await db.signRequestFile.findMany({
    where: { requestId },
    orderBy: { position: "asc" },
    include: { file: { select: { data: true, storageKey: true } }, request: { select: { title: true } } },
  });
  const d = docs[index];
  if (!d) return null;
  return {
    original: await readStoredFile(d.file),
    title: docLabel(d, d.request, docs.length),
    /** Fila de más en la hoja de firma cuando el envío tiene varios documentos */
    extra: docs.length > 1 ? ([["Envío", `${d.request.title} · documento ${index + 1} de ${docs.length}`]] as [string, string][]) : [],
  };
}
