"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { externalPdf, hasSession, SESSION_HOURS, sendCode, sessionCookie, signAsExternal, signerByToken, verifyCode } from "@/lib/externalSign";
import { sendMail } from "@/lib/mail";
import { notifyIfAllSigned } from "@/lib/signRequests";

type Result = { ok: boolean; message: string } | null;

/** Envía el código de 6 cifras a su email. */
export async function requestCode(token: string): Promise<Result> {
  const s = await signerByToken(token);
  if (!s) return { ok: false, message: "Este enlace no es válido." };
  const error = await sendCode(s);
  return error ? { ok: false, message: error } : { ok: true, message: "Te hemos enviado el código. Mira tu email (y la carpeta de spam)." };
}

/** Comprueba el código y abre la sesión para leer y firmar. */
export async function checkCode(token: string, _prev: Result, form: FormData): Promise<Result> {
  const s = await signerByToken(token);
  if (!s) return { ok: false, message: "Este enlace no es válido." };
  const r = await verifyCode(s, String(form.get("code") ?? ""));
  if (!r.ok) return r;
  (await cookies()).set(sessionCookie(s.id), r.session, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_HOURS * 3600 });
  revalidatePath(`/firmar/${token}`);
  return { ok: true, message: "Código correcto." };
}

/** Firma el documento. */
export async function signExternal(token: string, _prev: Result, form: FormData): Promise<Result> {
  const s = await signerByToken(token);
  if (!s || !hasSession(s, (await cookies()).get(sessionCookie(s.id))?.value)) return { ok: false, message: "Tu sesión ha caducado. Vuelve a abrir el enlace y pide otro código." };
  if (s.signedAt) return { ok: true, message: "Ya estaba firmado." };
  if (form.get("accept") !== "1") return { ok: false, message: "Marca la casilla de conformidad." };
  const m = String(form.get("signature") ?? "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { ok: false, message: "Firma en el recuadro antes de continuar." };
  const png = Buffer.from(m[1], "base64");
  if (png.length < 500) return { ok: false, message: "La firma es demasiado corta. Firma de nuevo." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  if (!(await signAsExternal(s, png, ip, note))) return { ok: true, message: "Ya estaba firmado." };
  await audit(`${s.name} (externo)`, "Sistema", "Documento", "Firmado", `${s.name} (${s.email}, de fuera de la plataforma) firma «${s.request.title}»${note ? ` con observaciones: ${note}` : ""}`, { entityId: s.request.id });
  after(async () => {
    // Su copia firmada, por email
    const pdf = Buffer.from(await externalPdf(s.id));
    await sendMail(s.email, `Documento firmado: ${s.request.title}`, `Hola ${s.name.split(" ")[0]},\n\nhas firmado «${s.request.title}». Te adjuntamos tu copia firmada en PDF.`, [
      { filename: `${s.request.title.replace(/[^\w\sáéíóúñü-]/gi, "").trim().slice(0, 60) || "documento"} - firmado.pdf`, content: pdf },
    ]).catch((e) => console.error("copia firmada externa", e));
    await notifyIfAllSigned(s.request.id, s.request.title);
  });
  revalidatePath(`/firmar/${token}`);
  revalidatePath(`/admin/documentos/firmar/${s.request.id}`);
  return { ok: true, message: "¡Firmado! Te hemos enviado tu copia firmada por email." };
}
