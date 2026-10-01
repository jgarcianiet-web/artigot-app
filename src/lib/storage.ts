import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Almacén de archivos compatible con S3 (Cloudflare R2, Backblaze B2, AWS S3, buckets de Railway…).
 * Guarda los documentos, fotos y firmas fuera de la base de datos y las copias de seguridad.
 * Si FILES_ENCRYPTION_KEY está definida, todo se cifra con AES-256-GCM antes de salir del servidor.
 *
 * Variables: S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT (no hace falta en AWS),
 * S3_REGION (por defecto "auto") y FILES_ENCRYPTION_KEY (recomendada).
 */

let client: S3Client | null = null;

export function storageEnabled() {
  return !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

export const encryptionEnabled = () => !!process.env.FILES_ENCRYPTION_KEY;

function s3() {
  if (!storageEnabled()) throw new Error("El almacén de archivos no está configurado.");
  client ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  return client;
}
const bucket = () => process.env.S3_BUCKET!;

// ---------- Cifrado ----------

const MAGIC = Buffer.from("ARTG1"); // cabecera de los archivos cifrados
const key = () => createHash("sha256").update(process.env.FILES_ENCRYPTION_KEY!).digest();

export function encrypt(data: Buffer) {
  if (!encryptionEnabled()) return data;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function decrypt(data: Buffer) {
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) return data; // guardado sin cifrar
  if (!encryptionEnabled()) throw new Error("Este archivo está cifrado y falta FILES_ENCRYPTION_KEY.");
  const iv = data.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = data.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data.subarray(MAGIC.length + 28)), d.final()]);
}

// ---------- Operaciones ----------

export async function putObject(objectKey: string, data: Buffer, contentType = "application/octet-stream") {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: objectKey, Body: encrypt(data), ContentType: encryptionEnabled() ? "application/octet-stream" : contentType }));
}

export async function getObject(objectKey: string) {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: objectKey }));
  return decrypt(Buffer.from(await r.Body!.transformToByteArray()));
}

/** Descarga tal cual (sin descifrar), para bajarse una copia de seguridad. */
export async function getRawObject(objectKey: string) {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: objectKey }));
  return Buffer.from(await r.Body!.transformToByteArray());
}

export async function deleteObject(objectKey: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: objectKey }));
}

export async function listObjects(prefix: string) {
  const out: { key: string; size: number; modified: Date | null }[] = [];
  let token: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) out.push({ key: o.Key!, size: o.Size ?? 0, modified: o.LastModified ?? null });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}
