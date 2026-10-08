import nodemailer from "nodemailer";
import { appUrl } from "./domain";

/**
 * Envío de emails, de dos formas:
 * - Por la API de Brevo (BREVO_API_KEY), que va por HTTPS: funciona aunque el servidor bloquee el SMTP (Railway lo
 *   bloquea en sus planes Free, Trial y Hobby). Remitente: MAIL_FROM o SMTP_FROM («Artigot <rrhh@artigot.com>»).
 * - Por SMTP (Gmail/Google Workspace, Office 365, IONOS…): SMTP_HOST, SMTP_PORT (587 por defecto; 465 = SSL),
 *   SMTP_USER, SMTP_PASS y SMTP_FROM.
 * Sin ninguna de las dos no se envía nada y RRHH copia los datos a mano.
 */

export const mailEnabled = () => !!process.env.BREVO_API_KEY || !!process.env.SMTP_HOST;
export const mailVia = () => (process.env.BREVO_API_KEY ? "Brevo" : process.env.SMTP_HOST ? `SMTP (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587})` : null);

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function transporter() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      // Si el servidor de correo no responde (p. ej. el puerto está bloqueado), fallar enseguida en vez de esperar minutos
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendMail(to: string, subject: string, text: string) {
  if (!mailEnabled()) throw new Error("El envío de emails no está configurado (SMTP_HOST).");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1917">${esc(text)
    .split("\n")
    .map((l) => (l ? `<p style="margin:0 0 8px">${l.replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>` : ""))
    .join("")}</div>`;
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  if (process.env.BREVO_API_KEY) return sendBrevo(from, to, subject, text, html);
  await transporter().sendMail({ from, to, subject, text, html });
}

/** «Artigot RRHH <rrhh@artigot.com>» → { name, email } */
function parseFrom(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: from.trim() };
}

async function sendBrevo(from: string, to: string, subject: string, text: string, html: string) {
  const sender = parseFrom(from);
  if (!sender.email) throw new Error("Falta el remitente: pon MAIL_FROM (p. ej. «Artigot RRHH <rrhh@artigot.com>») en Railway.");
  const res = await fetch(process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Brevo respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

type AccessWorker = { name: string; phone: string | null; email: string | null; accessCode: string };

/** Texto con los datos para entrar en la app (se copia o se envía por email). */
export function accessText(w: AccessWorker) {
  return [
    `Hola ${w.name.split(" ")[0]}, ya tienes acceso a la app de Artigot para ver convocatorias, confirmar, fichar y hablar en el chat de cada evento.`,
    `Entra en ${appUrl()} (o en la app) con:`,
    w.phone ? `Teléfono: ${w.phone}` : `Email: ${w.email}`,
    `Código: ${w.accessCode}`,
    process.env.ANDROID_APK_URL && `App Android: ${process.env.ANDROID_APK_URL}`,
    process.env.IOS_APP_URL && `App iPhone: ${process.env.IOS_APP_URL}`,
    "",
    "La primera vez te pediremos tu foto de perfil, tus datos y tus documentos.",
  ]
    .filter((l): l is string => typeof l === "string")
    .join("\n");
}

/** Envía por email el código de acceso. Devuelve el error para mostrarlo, o null si se ha enviado. */
export async function sendAccessEmail(w: AccessWorker): Promise<string | null> {
  if (!w.email) return "No tiene email.";
  if (!mailEnabled()) return "El envío de emails no está configurado; copia las instrucciones y envíaselas tú.";
  try {
    await sendMail(w.email, "Tu acceso a la app de Artigot", accessText(w));
    return null;
  } catch (e) {
    console.error("Email de acceso", e);
    return `No se ha podido enviar el email (${(e as Error).message}).`;
  }
}
