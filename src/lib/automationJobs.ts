import { getA3 } from "./a3";
import {
  ALTA_SELECT, altaProblems, buildAltaWorkbook, buildAltasSucesivasWorkbook, buildAmpWorkbook, buildBajasWorkbook, buildBancoPagoWorkbook,
  buildImputacionWorkbook, bumpLastCode, getA3Alta, nextA3Code, type AltaRow,
} from "./a3alta";
import { audit } from "./audit";
import { getAutomation, nextMonday } from "./automation";
import { syncAutoEmployments } from "./autoAltas";
import { madridTime } from "./clockRules";
import { db } from "./db";
import { addDays, appUrl, formatDate, isRole, ROLE_LABEL, ROLE_PLURAL, ROLES, type Role } from "./domain";
import { mailEnabled, sendMail, type MailAttachment } from "./mail";
import { getPaySettings } from "./pay";
import { datesBetween, remindPollPending, sendPoll } from "./polls";
import { notify } from "./push";
import { claim } from "./reminderLog";
import { coverage, fillGaps } from "./staffing";

const madridDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const AUTO_ACTOR = "Automático";

// ---------- 1. Convocatoria automática ----------

/** Día y hora en que se convoca solo un evento (o null si es a mano). */
export function autoConvokeAt(ev: { date: string; autoConvokeDays: number | null }, hour: string) {
  return ev.autoConvokeDays == null ? null : madridTime(addDays(ev.date, -ev.autoConvokeDays), hour);
}

/**
 * Convoca a los mejor puntuados que estén libres hasta cubrir el personal necesario, si al evento ya le toca
 * (X días antes, desde la hora de Ajustes → Automatizaciones). La primera vez avisa a RRHH con el resumen; después
 * (p. ej. si se sube el personal necesario) solo cubre lo que falte.
 */
export async function autoConvoke(eventId: string, now = new Date()) {
  const ev = await db.event.findUnique({ where: { id: eventId } });
  if (!ev || ev.autoConvokeDays == null || ev.status !== "ABIERTO" || ev.date < madridDate(now)) return null;
  const { convoke } = await getAutomation();
  if (now < autoConvokeAt(ev, convoke.hour)!) return null;
  const first = !ev.autoConvokedAt;
  const { invited } = await fillGaps(eventId);
  if (first) await db.event.update({ where: { id: eventId }, data: { autoConvokedAt: now } });
  if (!first && !invited.length) return { invited, missing: 0 };

  const fresh = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { assignments: { select: { role: true, status: true } } } });
  const short = coverage(fresh, fresh.assignments).filter((c) => c.need > c.confirmed + c.pending);
  const missing = short.reduce((n, c) => n + c.need - c.confirmed - c.pending, 0);
  const byRole = ROLES.map((r) => [r, invited.filter((i) => i.role === r).length] as const).filter(([, n]) => n);
  const invitedText = byRole.length ? byRole.map(([r, n]) => `${n} ${(n === 1 ? ROLE_LABEL[r] : ROLE_PLURAL[r]).toLowerCase()}`).join(", ") : "nadie";
  const missingText = short.map((c) => `${c.need - c.confirmed - c.pending} ${ROLE_PLURAL[c.role].toLowerCase()}`).join(", ");
  await audit(AUTO_ACTOR, "Sistema", "Convocatoria", "Automática", `${ev.name} (${formatDate(ev.date)}): convocados ${invitedText}${missing ? `; sin gente libre para ${missingText}` : ""}`, { entityId: eventId });
  await notify({
    admins: true,
    adminUrl: `/admin/eventos/${eventId}`,
    title: missing ? "⚠ Convocatoria automática incompleta" : "🤖 Convocatoria automática",
    body: `${ev.name} (${formatDate(ev.date)}): ${first ? "" : "más "}convocados ${invitedText}.${missing ? ` Falta gente libre: ${missingText}.` : ""}`,
    tag: `autoconv-${eventId}`,
  });
  return { invited, missing };
}

/** Eventos a los que ya les toca la convocatoria automática y aún no se ha hecho. */
async function dueConvocations(now: Date) {
  const events = await db.event.findMany({
    where: { autoConvokeDays: { not: null }, autoConvokedAt: null, status: "ABIERTO", date: { gte: madridDate(now) } },
    select: { id: true },
  });
  const out: string[] = [];
  for (const e of events) {
    const r = await autoConvoke(e.id, now);
    if (r) out.push(`autoconvocatoria:${e.id}`);
  }
  return out;
}

// ---------- 2. Disponibilidad semanal ----------

async function weeklyAvailability(now: Date) {
  const { availability: s } = await getAutomation();
  const today = madridDate(now);
  const out: string[] = [];
  if (!s.enabled || now < madridTime(today, s.hour)) return out;
  if (weekday(today) === s.weekday && (await claim(`disponibilidad:${today}`))) {
    const monday = nextMonday(today);
    const dates = datesBetween(monday, addDays(monday, 6), s.days);
    if (dates.length) {
      const { poll, people } = await sendPoll({
        title: `Disponibilidad semana del ${formatDate(monday)} al ${formatDate(addDays(monday, 6))}`,
        message: "Marca los días que puedes trabajar. Con tus respuestas te convocamos primero a los eventos de esos días.",
        dates,
        roles: [],
        createdBy: AUTO_ACTOR,
      });
      await audit(AUTO_ACTOR, "Sistema", "Sondeo", "Enviado", `«${poll.title}»: ${dates.length} días, enviado a ${people} personas`, { entityId: poll.id });
      out.push(`disponibilidad:${poll.id}`);
    }
  }
  // Al día siguiente, recordatorio a quien no ha contestado
  if (s.remind && weekday(today) === (s.weekday + 1) % 7 && (await claim(`disponibilidad-recordatorio:${today}`))) {
    const poll = await db.availabilityPoll.findFirst({
      where: { createdBy: AUTO_ACTOR, closedAt: null, createdAt: { gte: new Date(now.getTime() - 2 * 864e5) } },
      orderBy: { createdAt: "desc" },
    });
    if (poll) {
      const { pending } = await remindPollPending(poll.id);
      out.push(`disponibilidad-recordatorio:${pending}`);
    }
  }
  return out;
}

// ---------- 3. Email diario con los Excel de A3 ----------

const xlsxName = (prefix: string, day: string) => `${prefix}_${day}.xlsx`;

/**
 * Prepara los Excel de A3 de las altas de mañana y de las bajas de hoy:
 * - Quien aún no tiene código de A3 y tiene todos los datos: se le da el siguiente código y va en el alta masiva
 *   (con imputación, banco de pago y AMP según Ajustes → A3). Quien tiene datos sin completar se lista para RRHH.
 * - Todas las altas con código van en el «MA - Alta sucesiva»; las bajas de hoy en el «MB - Baja».
 */
export async function a3DailyFiles(now = new Date()) {
  const today = madridDate(now);
  const tomorrow = addDays(today, 1);
  await syncAutoEmployments({ actor: AUTO_ACTOR });
  const [a3, cfg, pay, altas, bajas] = await Promise.all([
    getA3(),
    getA3Alta(),
    getPaySettings(),
    db.employment.findMany({
      where: { startDate: tomorrow },
      include: { worker: { select: { ...ALTA_SELECT, a3Code: true } } },
      orderBy: { worker: { name: "asc" } },
    }),
    db.employment.findMany({
      where: { endDate: today, worker: { a3Code: { not: null } } },
      include: { worker: { select: { name: true, a3Code: true, firstName: true, surname1: true, surname2: true } } },
      orderBy: { worker: { name: "asc" } },
    }),
  ]);
  const roleOf = (category: string | null, fallback: string): Role =>
    (Object.entries(ROLE_LABEL).find(([, label]) => label === category)?.[0] as Role | undefined) ?? (isRole(fallback) ? fallback : "CAMARERO");

  // Nuevos en A3: código para los que tienen los datos completos. Se apunta a quién se le dio código para esta fecha:
  // si se vuelven a generar los Excel (p. ej. «Enviar ahora» y luego el automático) siguen yendo en el alta masiva
  const key = `a3-nuevos:${tomorrow}`;
  const already = new Set(((await db.setting.findUnique({ where: { key } }))?.value as string[] | undefined) ?? []);
  const incomplete: { name: string; problems: string[] }[] = [];
  const fresh = altas.filter((e) => e.worker.a3Code && already.has(e.worker.id));
  const newIds = fresh.map((e) => e.worker.id);
  const newRows: AltaRow[] = fresh.map((e) => ({ code: e.worker.a3Code!, startDate: tomorrow, worker: e.worker }));
  let next = await nextA3Code();
  for (const e of altas.filter((x) => !x.worker.a3Code)) {
    const problems = altaProblems(e.worker);
    if (problems.length) {
      incomplete.push({ name: e.worker.name, problems });
      continue;
    }
    const code = String(next++);
    await db.worker.update({ where: { id: e.worker.id }, data: { a3Code: code } });
    e.worker.a3Code = code;
    newRows.push({ code, startDate: tomorrow, worker: e.worker });
    newIds.push(e.worker.id);
  }
  if (newRows.length > already.size) {
    await bumpLastCode(next - 1);
    await db.setting.upsert({ where: { key }, create: { key, value: newIds }, update: { value: newIds } });
  }

  const files: (MailAttachment & { label: string })[] = [];
  if (newRows.length) {
    files.push({ filename: xlsxName("alta_masiva_a3", tomorrow), label: "Alta masiva (nuevos en A3)", content: await buildAltaWorkbook(newRows, a3.companyCode, cfg) });
    if (cfg.imputation || cfg.imputationMozo) files.push({ filename: xlsxName("imputacion_a3", tomorrow), label: "Imputación", content: await buildImputacionWorkbook(newRows, a3.companyCode, cfg) });
    if (pay.debtorIban) files.push({ filename: xlsxName("banco_pago_a3", tomorrow), label: "Datos Banco de Pago", content: await buildBancoPagoWorkbook(newRows, a3.companyCode, pay.debtorIban) });
    const waiters = newRows.filter((r) => r.worker.role !== "MOZO");
    if (cfg.ampExtra && waiters.length) files.push({ filename: xlsxName("camareros_extras_a3", tomorrow), label: "Camareros extras (AMP)", content: await buildAmpWorkbook(waiters, a3.companyCode) });
  }
  const coded = altas.filter((e) => e.worker.a3Code);
  if (coded.length)
    files.push({
      filename: xlsxName("altas_a3", tomorrow),
      label: "MA - Alta sucesiva",
      content: await buildAltasSucesivasWorkbook(
        coded.map((e) => ({
          code: e.worker.a3Code, name: e.worker.name, firstName: e.worker.firstName, surname1: e.worker.surname1, surname2: e.worker.surname2, date: tomorrow,
          role: roleOf(e.category, e.worker.role), center: e.worker.a3Center,
        })),
        a3.companyCode,
        cfg,
      ),
    });
  if (bajas.length)
    files.push({
      filename: xlsxName("bajas_a3", today),
      label: "MB - Baja",
      content: await buildBajasWorkbook(
        bajas.map((e) => ({ code: e.worker.a3Code, name: e.worker.name, firstName: e.worker.firstName, surname1: e.worker.surname1, surname2: e.worker.surname2, date: today })),
        a3.companyCode,
        cfg,
      ),
    });
  return { today, tomorrow, files, newRows, coded: coded.length, bajas: bajas.length, incomplete };
}

/** Destinatarios: los de Ajustes → Automatizaciones o, si no hay, todos los usuarios de RRHH activos. */
async function a3Recipients(to: string) {
  const list = to.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  if (list.length) return list;
  return (await db.adminUser.findMany({ where: { active: true }, select: { email: true } })).map((a) => a.email).filter(Boolean);
}

export async function sendA3DailyEmail(now = new Date()) {
  const { a3Email: s } = await getAutomation();
  const r = await a3DailyFiles(now);
  if (!r.files.length && !r.incomplete.length) return { sent: 0, ...r };
  const lines = [
    `Excel de A3 preparados por la app para mañana, ${formatDate(r.tomorrow)}:`,
    "",
    ...r.files.map((f) => `• ${f.label}: ${f.filename}`),
    ...(r.newRows.length ? ["", `Nuevos en A3 (código asignado): ${r.newRows.map((x) => `${x.worker.name} (${x.code})`).join(", ")}.`] : []),
    ...(r.coded ? [`Altas de mañana: ${r.coded}.`] : []),
    ...(r.bajas ? [`Bajas de hoy: ${r.bajas}.`] : []),
    ...(r.incomplete.length
      ? ["", "⚠ Trabajan mañana pero les faltan datos para el alta en A3 (complétalos y hazles el alta en Altas y bajas → A3):", ...r.incomplete.map((x) => `• ${x.name}: falta ${x.problems.join(", ")}`)]
      : []),
    "",
    "Importa los Excel en A3 y comunica las altas y bajas en RED como siempre. Después márcalas como comunicadas en la app.",
  ];
  const to = await a3Recipients(s.to);
  let sent = 0;
  for (const email of to) {
    try {
      await sendMail(email, `A3: altas de mañana ${formatDate(r.tomorrow)}${r.bajas ? " y bajas de hoy" : ""}`, lines.join("\n"), r.files, { button: { label: "Ir a Altas y bajas", url: `${appUrl()}/admin/altas` } });
      sent++;
    } catch (e) {
      console.error("email A3", email, e);
    }
  }
  await audit(
    AUTO_ACTOR,
    "Sistema",
    "A3",
    "Email diario",
    `Excel de A3 para el ${formatDate(r.tomorrow)} enviados a ${to.join(", ") || "nadie"} (${r.files.map((f) => f.label).join(", ") || "sin Excel"})${r.newRows.length ? `; códigos nuevos: ${r.newRows.map((x) => `${x.worker.name} ${x.code}`).join(", ")}` : ""}${r.incomplete.length ? `; sin datos completos: ${r.incomplete.map((x) => x.name).join(", ")}` : ""}`,
  );
  if (r.incomplete.length)
    await notify({
      admins: true,
      adminUrl: "/admin/altas/a3",
      title: "Faltan datos para el alta en A3",
      body: `Trabajan mañana sin datos completos: ${r.incomplete.map((x) => x.name).join(", ")}.`,
      tag: "a3-incompletos",
    });
  return { sent, ...r };
}

async function a3Daily(now: Date) {
  const { a3Email: s } = await getAutomation();
  const today = madridDate(now);
  if (!s.enabled || !mailEnabled() || now < madridTime(today, s.hour)) return [];
  if (!(await claim(`a3-email:${today}`))) return [];
  const r = await sendA3DailyEmail(now);
  return [`a3-email:${r.files.length}`];
}

/** Lo que se comprueba en cada vuelta de los avisos automáticos. */
export async function runAutomations(now = new Date()) {
  const out: string[] = [];
  for (const [name, job] of [
    ["convocatoria automática", dueConvocations],
    ["disponibilidad semanal", weeklyAvailability],
    ["email de A3", a3Daily],
  ] as const) {
    try {
      out.push(...(await job(now)));
    } catch (e) {
      console.error(name, e);
    }
  }
  return out;
}
