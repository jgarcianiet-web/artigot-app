"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { getAutomation, isHour, saveAutomation, WEEKDAY_LABEL, type AutomationSettings } from "@/lib/automation";
import { accessPending, sendA3DailyEmail, sendAccessBatch } from "@/lib/automationJobs";
import { EVENT_TYPES } from "@/lib/domain";
import { mailEnabled } from "@/lib/mail";
import { claim } from "@/lib/reminderLog";

const madridDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

export async function saveAutomationAction(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const int = (k: string, min: number, max: number, def: number) => {
    const n = Math.round(Number(form.get(k)));
    return Number.isFinite(n) && String(form.get(k) ?? "") !== "" ? Math.min(max, Math.max(min, n)) : def;
  };
  const hour = (k: string, def: string) => (isHour(String(form.get(k) ?? "")) ? String(form.get(k)) : def);
  const cur = await getAutomation();
  const value: AutomationSettings = {
    convoke: { defaultOn: form.get("convokeDefaultOn") === "1", days: int("convokeDays", 0, 60, cur.convoke.days), hour: hour("convokeHour", cur.convoke.hour) },
    availability: {
      enabled: form.get("availEnabled") === "1",
      weekday: int("availWeekday", 0, 6, cur.availability.weekday),
      hour: hour("availHour", cur.availability.hour),
      days: form.getAll("availDays").map(Number).filter((n) => n >= 0 && n <= 6),
      remind: form.get("availRemind") === "1",
    },
    ratios: Object.fromEntries(
      EVENT_TYPES.map((t) => [
        t,
        {
          camareros: int(`r_${t}_camareros`, 0, 1000, 0),
          maitres: int(`r_${t}_maitres`, 0, 5000, 0),
          mozos: int(`r_${t}_mozos`, 0, 5000, 0),
          minMaitres: int(`r_${t}_minMaitres`, 0, 20, 0),
        },
      ]),
    ),
    a3Email: { enabled: form.get("a3Enabled") === "1", hour: hour("a3Hour", cur.a3Email.hour), to: String(form.get("a3To") ?? "").trim().slice(0, 500) },
    dataReminder: { enabled: form.get("dataEnabled") === "1" },
    accessEmail: {
      enabled: form.get("accessEnabled") === "1",
      hour: hour("accessHour", cur.accessEmail.hour),
      maxPerDay: int("accessMax", 1, 1000, cur.accessEmail.maxPerDay),
      resendDays: int("accessResend", 0, 60, cur.accessEmail.resendDays),
    },
  };
  if (value.availability.enabled && !value.availability.days.length) return "Marca al menos un día de la semana para la disponibilidad.";
  await saveAutomation(value);
  await auditAdmin(
    by,
    "Ajustes",
    "Automatizaciones",
    `Convocatoria automática ${value.convoke.defaultOn ? `por defecto ${value.convoke.days} días antes` : "a mano por defecto"} (${value.convoke.hour}); disponibilidad ${value.availability.enabled ? `los ${WEEKDAY_LABEL[value.availability.weekday].toLowerCase()} a las ${value.availability.hour}` : "desactivada"}; email de A3 ${value.a3Email.enabled ? `a las ${value.a3Email.hour}` : "desactivado"}; recordatorio de completar datos ${value.dataReminder.enabled ? "activado" : "en pausa"}; datos de acceso ${value.accessEmail.enabled ? `a las ${value.accessEmail.hour}, hasta ${value.accessEmail.maxPerDay} al día` : "desactivado"}`,
  );
  revalidatePath("/admin/ajustes/automatizaciones");
  return "Guardado.";
}

/** Envía ahora el email con los Excel de A3 de mañana (el automático de hoy ya no se repite). */
export async function sendA3EmailNow(_prev: string | null) {
  const by = await requireAdmin();
  if (!mailEnabled()) return "El envío de emails no está configurado.";
  await claim(`a3-email:${madridDate()}`);
  const r = await sendA3DailyEmail();
  await auditAdmin(by, "A3", "Email diario", "Enviado a mano desde Ajustes → Automatizaciones");
  if (!r.files.length && !r.incomplete.length) return "Mañana no hay altas ni hoy bajas: no se ha enviado nada.";
  return `Enviado a ${r.sent} ${r.sent === 1 ? "persona" : "personas"}: ${r.files.map((f) => f.filename).join(", ") || "sin Excel"}${r.incomplete.length ? `. Sin datos completos: ${r.incomplete.map((x) => x.name).join(", ")}` : ""}.`;
}

/** Envía ya los datos de acceso a quien tiene email y aún no ha entrado (con el máximo diario de los ajustes). */
export async function sendAccessNow(_prev: string | null) {
  const by = await requireAdmin();
  if (!mailEnabled()) return "El envío de emails no está configurado.";
  const { accessEmail: s } = await getAutomation();
  const pending = (await accessPending(s.resendDays)).length;
  if (!pending) return "No hay nadie pendiente: todos los que tienen email y DNI ya han entrado o ya han recibido sus datos.";
  const r = await sendAccessBatch(s.maxPerDay, s.resendDays);
  await auditAdmin(by, "Trabajador", "Datos de acceso por email", `Envío a mano desde Ajustes → Automatizaciones: ${r.sent} enviados`);
  revalidatePath("/admin/ajustes/automatizaciones");
  const left = pending - r.sent - r.failed.length;
  return `Enviados ${r.sent}.${r.failed.length ? ` No se han podido enviar ${r.failed.length}: ${r.failed.slice(0, 3).join("; ")}.` : ""}${left > 0 ? ` Quedan ${left}: se enviarán en los próximos días (máximo ${s.maxPerDay} al día).` : ""}`;
}
