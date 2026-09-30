import { db } from "./db";
import { MAX_FILE_BYTES, storeDocument } from "./files";

/**
 * DNI, nº de la Seguridad Social e IBAN van siempre acompañados de su documento:
 * foto o PDF del DNI/NIE, de la tarjeta de la Seguridad Social y del certificado de titularidad de la cuenta.
 * Si el dato se rellena o se cambia y aún no hay documento de ese tipo (o el dato ha cambiado), hay que adjuntarlo.
 */
export const IDENTITY_DOCS = [
  { field: "dni", type: "DNI", input: "doc_dni", what: "la foto o PDF del DNI / NIE" },
  { field: "nss", type: "NSS", input: "doc_nss", what: "la foto o PDF de la tarjeta de la Seguridad Social" },
  { field: "iban", type: "CUENTA", input: "doc_iban", what: "el certificado de titularidad de la cuenta (o una captura de la app del banco donde se vea el IBAN y el titular)" },
] as const;

type Values = { dni: string | null; nss: string | null; iban: string | null };

const hasFile = (form: FormData, key: string) => {
  const f = form.get(key);
  return f instanceof File && f.size > 0;
};

/** Error si falta algún documento obligatorio, o null. */
export async function checkIdentityDocs(workerId: string | null, before: Values | null, after: Values, form: FormData) {
  const have = new Set(
    workerId ? (await db.workerDocument.findMany({ where: { workerId, type: { in: IDENTITY_DOCS.map((d) => d.type) } }, select: { type: true } })).map((d) => d.type) : [],
  );
  for (const d of IDENTITY_DOCS) {
    const f = form.get(d.input);
    if (f instanceof File && f.size > 0) {
      if (!f.type.startsWith("image/") && f.type !== "application/pdf") return `El documento de ${d.field === "iban" ? "la cuenta" : d.field === "nss" ? "la Seguridad Social" : "DNI"} tiene que ser una foto o un PDF.`;
      if (f.size > MAX_FILE_BYTES) return "Algún documento es demasiado grande (máximo 5 MB).";
    }
  }
  for (const d of IDENTITY_DOCS) {
    const value = after[d.field];
    if (!value) continue;
    const changed = (before?.[d.field] ?? null) !== value;
    if ((changed || !have.has(d.type)) && !hasFile(form, d.input)) return `Adjunta ${d.what}.`;
  }
  return null;
}

/** Guarda los documentos adjuntados en el formulario. */
export async function storeIdentityDocs(workerId: string, form: FormData, uploadedBy: string, verified: boolean) {
  const stored: string[] = [];
  for (const d of IDENTITY_DOCS) {
    const f = form.get(d.input);
    if (!(f instanceof File) || f.size === 0) continue;
    const file = await storeDocument(f, workerId);
    const expiresAt = d.type === "DNI" ? String(form.get("doc_dni_expires") ?? "") : "";
    await db.workerDocument.create({
      data: { workerId, type: d.type, fileId: file.id, uploadedBy, verified, expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(expiresAt) ? expiresAt : null },
    });
    stored.push(d.type);
  }
  return stored;
}

/** Documentos de identidad que ya tiene cada tipo (el más reciente), para mostrarlos junto al campo. */
export async function identityDocStatus(workerId: string) {
  const docs = await db.workerDocument.findMany({
    where: { workerId, type: { in: IDENTITY_DOCS.map((d) => d.type) } },
    orderBy: { createdAt: "desc" },
    select: { type: true, fileId: true, verified: true },
  });
  const out: Record<string, { fileId: string | null; verified: boolean }> = {};
  for (const d of docs) if (!out[d.type]) out[d.type] = { fileId: d.fileId, verified: d.verified };
  return out;
}
