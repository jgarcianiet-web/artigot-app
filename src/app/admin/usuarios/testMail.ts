"use server";

import { auditAdmin } from "@/lib/audit";
import { currentAdmin } from "@/lib/auth";
import { mailEnabled, sendMail } from "@/lib/mail";

export type TestMailResult = { ok: boolean; message: string } | null;

/** Email de prueba para comprobar la configuración SMTP de Railway (muestra el error tal cual si falla). */
export async function sendTestMail(_prev: TestMailResult, form: FormData): Promise<TestMailResult> {
  const me = await currentAdmin();
  if (!me) return { ok: false, message: "No autorizado." };
  if (!mailEnabled()) return { ok: false, message: "El envío de emails no está configurado: falta la variable SMTP_HOST en Railway (o la app aún no se ha vuelto a desplegar)." };
  const to = String(form.get("to") ?? "").trim() || me.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, message: "Escribe un email válido." };
  try {
    await sendMail(to, "Prueba de email de Artigot", `Hola,\n\nEste es un email de prueba enviado desde la app de Artigot por ${me.name}.\nSi lo recibes, el envío de emails funciona.`);
    await auditAdmin(me.name, "Ajustes", "Email de prueba", `Email de prueba enviado a ${to}`);
    return { ok: true, message: `Enviado a ${to}. Mira la bandeja de entrada (y la de spam).` };
  } catch (e) {
    const err = e as { message?: string; code?: string; responseCode?: number };
    const hint =
      err.code === "EAUTH" || err.responseCode === 535
        ? " → Usuario o contraseña incorrectos. Con Gmail hay que usar una «contraseña de aplicación»."
        : err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET"
          ? " → No se puede conectar con el servidor de correo: revisa SMTP_HOST y SMTP_PORT. Si están bien, puede que vuestro plan de Railway bloquee el SMTP."
          : "";
    return { ok: false, message: `No se ha podido enviar: ${err.message ?? String(e)}${hint}` };
  }
}
