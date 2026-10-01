import nodemailer from "nodemailer";
import { appUrl } from "./domain";

/**
 * Envío de emails por SMTP (Gmail/Google Workspace, Office 365, IONOS… o un servicio como Brevo).
 * Variables: SMTP_HOST, SMTP_PORT (587 por defecto; 465 = SSL), SMTP_USER, SMTP_PASS y SMTP_FROM
 * («Artigot <rrhh@artigot.com>»). Sin SMTP_HOST no se envía nada y RRHH copia los datos a mano.
 */

export const mailEnabled = () => !!process.env.SMTP_HOST;

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function transporter() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
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
  await transporter().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
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
