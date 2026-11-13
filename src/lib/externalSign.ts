import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { appUrl } from "./domain";
import { readStoredFile, storeExternalSignature } from "./files";
import { mailEnabled, sendMail } from "./mail";
import { stampSignedPdf } from "./signedPdf";
import { validDniNie } from "./staff";

/**
 * Firma de documentos por personas de fuera de la plataforma (candidatos, antiguos trabajadores, proveedores…).
 * Dos canales, a elegir para cada persona:
 *  - EMAIL: reciben el enlace personal (/firmar/<token>) por email y, para abrir el documento, un código de 6 cifras a
 *    ese email (queda probado que firma quien recibe ese correo). Reciben su copia firmada por email.
 *  - WHATSAPP: RRHH les manda el enlace por WhatsApp desde la ficha del envío y, al abrirlo, escriben su DNI/NIE, que
 *    tiene que coincidir con el que puso RRHH. Descargan su copia firmada desde el mismo enlace.
 * Después firman con el dedo como el personal.
 */

export const EXTERNAL_DAYS = 15;
const CODE_MINUTES = 15;
const MAX_TRIES = 5;
const RESEND_SECONDS = 60;
export const SESSION_HOURS = 2;
export const sessionCookie = (id: string) => `firma_${id}`;

export const CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export type Channel = (typeof CHANNELS)[number];
export type ExternalInput = { name: string; dni: string; email: string; phone: string; channel: Channel };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const when = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" }).format(d);
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
      channel: (x?.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL") as Channel,
    }))
    .filter((x) => x.name || x.email || x.dni || x.phone)
    .map((x) => {
      if (x.name.length < 3) throw new Error("Escribe el nombre y apellidos de cada persona de fuera.");
      if (x.dni && !validDniNie(x.dni)) throw new Error(`El DNI/NIE de ${x.name} no es correcto (revisa la letra).`);
      if (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) throw new Error(`El email de ${x.name} no es válido.`);
      if (x.channel === "EMAIL") {
        if (!x.email) throw new Error(`Falta el email de ${x.name}: hace falta para enviarle el enlace y el código. Si no lo tienes, elige WhatsApp.`);
      } else {
        if (x.phone.replace(/\D/g, "").length < 9) throw new Error(`Falta el móvil de ${x.name} para enviárselo por WhatsApp.`);
        if (!x.dni) throw new Error(`Falta el DNI/NIE de ${x.name}: por WhatsApp se identifica escribiendo su DNI/NIE.`);
      }
      const key = x.channel === "EMAIL" ? x.email : x.phone;
      if (seen.has(key)) throw new Error(`${key} está repetido.`);
      seen.add(key);
      return x;
    });
}

export const newToken = () => randomBytes(24).toString("base64url");
export const expiry = (from = new Date()) => new Date(from.getTime() + EXTERNAL_DAYS * 864e5);

/** Mensaje de WhatsApp con el enlace (lo envía RRHH desde la ficha del envío). */
export const whatsappText = (s: { name: string; token: string }, title: string) =>
  `Hola ${s.name.split(" ")[0]}, te envío «${title}» de Artigot Catering para que lo firmes. Abre este enlace y escribe tu DNI/NIE para verlo y firmarlo: ${signLink(s.token)}`;

/** Email con el enlace para firmar (solo a quien va por email). */
export async function inviteExternal(s: { name: string; email: string | null; channel: string; token: string; expiresAt: Date }, doc: { title: string; message: string | null; createdBy: string }, reminder = false) {
  if (s.channel !== "EMAIL" || !s.email || !mailEnabled()) return false;
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
  if (s.channel !== "EMAIL" || !s.email) return "Este enlace se abre con tu DNI/NIE.";
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

const normDni = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Por WhatsApp: comprueba el DNI/NIE que escribe. Si coincide, devuelve el valor de la cookie de sesión. */
export async function verifyDni(s: Signer, dni: string): Promise<{ ok: true; session: string } | { ok: false; message: string }> {
  // Ya firmado también vale: así vuelve a descargar su copia, que no le llega por email
  if (isExpired(s)) return { ok: false, message: "Este enlace ya no está activo." };
  if (s.channel !== "WHATSAPP" || !s.dni) return { ok: false, message: "Este enlace se abre con el código que te enviamos por email." };
  if (s.codeTries >= MAX_TRIES) return { ok: false, message: "Demasiados intentos. Pide a RRHH que te envíe el enlace de nuevo." };
  if (normDni(dni) !== normDni(s.dni)) {
    await db.externalSigner.update({ where: { id: s.id }, data: { codeTries: { increment: 1 } } });
    const left = MAX_TRIES - s.codeTries - 1;
    return { ok: false, message: left > 0 ? `El DNI/NIE no coincide (te quedan ${left} intentos).` : "Demasiados intentos. Pide a RRHH que te envíe el enlace de nuevo." };
  }
  const session = randomBytes(24).toString("base64url");
  await db.externalSigner.update({ where: { id: s.id }, data: { sessionHash: sha(session), verifiedAt: s.verifiedAt ?? new Date() } });
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
    ...(s.channel === "WHATSAPP"
      ? {
          extra: [["Enlace enviado por WhatsApp", `al ${s.phone ?? "—"}; identificado con su DNI/NIE${s.verifiedAt ? ` el ${when(s.verifiedAt)}` : ""}`]] as [string, string][],
          how: "lo firmó con su firma manuscrita desde un enlace personal enviado por WhatsApp a su móvil, tras identificarse con su DNI/NIE",
        }
      : {
          extra: [["Email verificado", `${s.email}${s.verifiedAt ? ` (código enviado y comprobado el ${when(s.verifiedAt)})` : ""}`]] as [string, string][],
          how: "lo firmó con su firma manuscrita desde un enlace personal, tras identificarse con un código de un solo uso enviado a su email",
        }),
  });
}
