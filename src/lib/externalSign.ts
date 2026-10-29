import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { appUrl } from "./domain";
import { readStoredFile, storeExternalSignature } from "./files";
import { mailEnabled, sendMail } from "./mail";
import { stampSignedPdf } from "./signedPdf";
import { validDniNie } from "./staff";

/**
 * Firma de documentos por personas de fuera de la plataforma (candidatos, antiguos trabajadores, proveedores…).
 * Reciben un enlace personal (/firmar/<token>) por email, o RRHH se lo manda por WhatsApp. Para abrir el documento
 * tienen que escribir un código de 6 cifras que se les envía a su email: así queda probado que firma quien recibe
 * ese correo. Después firman con el dedo como el personal y reciben su copia firmada por email.
 */

export const EXTERNAL_DAYS = 15;
const CODE_MINUTES = 15;
const MAX_TRIES = 5;
const RESEND_SECONDS = 60;
export const SESSION_HOURS = 2;
export const sessionCookie = (id: string) => `firma_${id}`;

export type ExternalInput = { name: string; dni: string; email: string; phone: string };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const signLink = (token: string) => `${appUrl()}/firmar/${token}`;

/** «jgarcia@gmail.com» → «jg•••@gmail.com» */
export function maskEmail(email: string) {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(3, u.length - 2))}@${d}`;
}

/** Comprueba y limpia las personas externas del formulario. */
export function parseExternals(raw: unknown): ExternalInput[] {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 50) throw new Error("Como mucho 50 personas de fuera en cada envío.");
  const seen = new Set<string>();
  return list
    .map((x) => ({
      name: String(x?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
      dni: String(x?.dni ?? "").trim().toUpperCase().replace(/[\s.-]/g, ""),
      email: String(x?.email ?? "").trim().toLowerCase(),
      phone: String(x?.phone ?? "").replace(/[^\d+]/g, "").slice(0, 16),
    }))
    .filter((x) => x.name || x.email || x.dni || x.phone)
    .map((x) => {
      if (x.name.length < 3) throw new Error("Escribe el nombre y apellidos de cada persona de fuera.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) throw new Error(`El email de ${x.name} no es válido: hace falta para enviarle el código.`);
      if (x.dni && !validDniNie(x.dni)) throw new Error(`El DNI/NIE de ${x.name} no es correcto (revisa la letra).`);
      if (seen.has(x.email)) throw new Error(`${x.email} está repetido.`);
      seen.add(x.email);
      return x;
    });
}

export const newToken = () => randomBytes(24).toString("base64url");
export const expiry = (from = new Date()) => new Date(from.getTime() + EXTERNAL_DAYS * 864e5);

/** Email con el enlace para firmar. */
export async function inviteExternal(s: { name: string; email: string; token: string; expiresAt: Date }, doc: { title: string; message: string | null; createdBy: string }, reminder = false) {
  if (!mailEnabled()) return false;
  const until = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long" }).format(s.expiresAt);
  await sendMail(
    s.email,
    reminder ? `Recordatorio: documento pendiente de firmar · ${doc.title}` : `Documento para firmar: ${doc.title}`,
    [
      `Hola ${s.name.split(" ")[0]},`,
      "",
      `${doc.createdBy}, de RRHH de Artigot Catering, te envía «${doc.title}» para que lo firmes electrónicamente.`,
      ...(doc.message ? ["", doc.message] : []),
      "",
      "Abre el enlace, te enviaremos un código a este email para comprobar que eres tú, lee el documento y fírmalo con el dedo o el ratón. Recibirás tu copia firmada por email.",
    ].join("\n"),
    [],
    { button: { label: "Revisar y firmar", url: signLink(s.token) }, after: `El enlace es personal y vale hasta el ${until}. Si no esperabas este email, ignóralo.` },
  );
  return true;
}

/** La persona del enlace, con el documento. */
export function signerByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return Promise.resolve(null);
  return db.externalSigner.findUnique({ where: { token }, include: { request: { select: { id: true, title: true, message: true, createdBy: true, fileId: true } } } });
}
export type Signer = NonNullable<Awaited<ReturnType<typeof signerByToken>>>;

export const isExpired = (s: { expiresAt: Date; signedAt: Date | null }) => !s.signedAt && s.expiresAt < new Date();
export const hasSession = (s: { sessionHash: string | null }, cookie: string | undefined) => !!cookie && !!s.sessionHash && sameHash(sha(cookie), s.sessionHash);

/** Envía el código de 6 cifras a su email. */
export async function sendCode(s: Signer): Promise<string | null> {
  if (s.signedAt || isExpired(s)) return "Este enlace ya no está activo.";
  if (s.codeSentAt && Date.now() - s.codeSentAt.getTime() < RESEND_SECONDS * 1000) return "Ya te hemos enviado un código. Espera un minuto para pedir otro.";
  if (!mailEnabled()) return "Ahora mismo no se pueden enviar emails. Avisa a RRHH.";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.externalSigner.update({ where: { id: s.id }, data: { codeHash: sha(`${s.id}:${code}`), codeSentAt: new Date(), codeTries: 0 } });
  try {
    await sendMail(s.email, `Tu código para firmar: ${code}`, `Hola ${s.name.split(" ")[0]},\n\nescribe este código para abrir «${s.request.title}» y firmarlo. Vale ${CODE_MINUTES} minutos.`, [], {
      box: [["Código", code]],
      after: "Si no has pedido este código, ignora este email.",
    });
  } catch (e) {
    console.error("código de firma", e);
    return "No se ha podido enviar el email. Inténtalo de nuevo en un momento.";
  }
  return null;
}

/** Comprueba el código. Si es correcto, devuelve el valor de la cookie de sesión. */
export async function verifyCode(s: Signer, code: string): Promise<{ ok: true; session: string } | { ok: false; message: string }> {
  if (s.signedAt || isExpired(s)) return { ok: false, message: "Este enlace ya no está activo." };
  if (!s.codeHash || !s.codeSentAt) return { ok: false, message: "Pide primero el código." };
  if (Date.now() - s.codeSentAt.getTime() > CODE_MINUTES * 60_000) return { ok: false, message: "El código ha caducado. Pide otro." };
  if (s.codeTries >= MAX_TRIES) return { ok: false, message: "Demasiados intentos. Pide un código nuevo." };
  if (!sameHash(sha(`${s.id}:${code.replace(/\D/g, "")}`), s.codeHash)) {
    await db.externalSigner.update({ where: { id: s.id }, data: { codeTries: { increment: 1 } } });
    return { ok: false, message: `El código no es correcto (te quedan ${MAX_TRIES - s.codeTries - 1} intentos).` };
  }
  const session = randomBytes(24).toString("base64url");
  await db.externalSigner.update({ where: { id: s.id }, data: { codeHash: null, sessionHash: sha(session), verifiedAt: s.verifiedAt ?? new Date() } });
  return { ok: true, session };
}

/** Guarda la firma. */
export async function signAsExternal(s: Signer, png: Buffer, ip: string | null, note: string | null) {
  const sig = await storeExternalSignature(png);
  const { count } = await db.externalSigner.updateMany({
    where: { id: s.id, signedAt: null },
    data: { signedAt: new Date(), signatureFileId: sig.id, signerIp: ip, signerNote: note },
  });
  return count === 1;
}

/** El PDF para una persona externa: el original, o firmado si ya lo ha firmado. */
export async function externalPdf(id: string) {
  const s = await db.externalSigner.findUniqueOrThrow({
    where: { id },
    include: { signature: { select: { data: true, storageKey: true } }, request: { include: { file: { select: { data: true, storageKey: true } } } } },
  });
  const original = await readStoredFile(s.request.file);
  if (!s.signedAt) return new Uint8Array(original);
  return stampSignedPdf(original, {
    id: s.id, title: s.request.title, name: s.name, dni: s.dni, signedAt: s.signedAt, ip: s.signerIp, note: s.signerNote,
    sentBy: s.request.createdBy, sentAt: s.createdAt, signature: s.signature ? await readStoredFile(s.signature) : null,
    extra: [["Email verificado", `${s.email}${s.verifiedAt ? ` (código enviado y comprobado el ${new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" }).format(s.verifiedAt)})` : ""}`]],
    how: "lo firmó con su firma manuscrita desde un enlace personal, tras identificarse con un código de un solo uso enviado a su email",
  });
}
