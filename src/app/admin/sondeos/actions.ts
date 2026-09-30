"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auditAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, isRole, today, workerRoles } from "@/lib/domain";
import { datesBetween, MAX_POLL_DATES, POLL_REASON } from "@/lib/polls";
import { notify } from "@/lib/push";

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Personal activo al que va dirigido (por puesto; sin puestos = todos). */
async function targets(roles: string[]) {
  const workers = await db.worker.findMany({ where: { active: true }, select: { id: true, role: true, roles: true } });
  return workers.filter((w) => !roles.length || workerRoles(w).some((r) => roles.includes(r)));
}

export async function createPoll(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const weekdays = form.getAll("weekday").map(Number).filter((n) => n >= 0 && n <= 6);
  const roles = form.getAll("roles").map(String).filter(isRole);
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const message = String(form.get("message") ?? "").trim().slice(0, 500) || null;
  if (!isDate(from) || !isDate(to) || to < from) return "Indica las fechas (desde y hasta).";
  if (from < today()) return "Las fechas tienen que ser a partir de hoy.";
  const dates = datesBetween(from, to, weekdays);
  if (!dates.length) return "No hay ningún día que coincida con los días de la semana elegidos.";
  if (dates.length >= MAX_POLL_DATES && dates.at(-1)! < to) return `Como máximo ${MAX_POLL_DATES} días por sondeo. Acorta las fechas.`;
  const poll = await db.availabilityPoll.create({
    data: { title: title || `Disponibilidad del ${formatDate(dates[0])} al ${formatDate(dates.at(-1)!)}`, message, dates, roles, createdBy: by },
  });
  const people = await targets(roles);
  await auditAdmin(by, "Sondeo", "Enviado", `«${poll.title}»: ${dates.length} días, enviado a ${people.length} personas`, { entityId: poll.id });
  after(() =>
    notify({
      workerIds: people.map((p) => p.id),
      workerUrl: "/app",
      title: "¿Qué días puedes trabajar?",
      body: `${poll.title}. Marca en la app los días que puedes (${dates.length} días).`,
      tag: `sondeo-${poll.id}`,
    }),
  );
  revalidatePath("/admin/sondeos");
  redirect(`/admin/sondeos/${poll.id}`);
}

export async function remindPoll(id: string) {
  const by = await requireAdmin();
  const poll = await db.availabilityPoll.findUniqueOrThrow({ where: { id }, include: { answers: { select: { workerId: true } } } });
  const answered = new Set(poll.answers.map((a) => a.workerId));
  const pending = (await targets(poll.roles)).filter((w) => !answered.has(w.id));
  if (pending.length) {
    after(() =>
      notify({ workerIds: pending.map((p) => p.id), workerUrl: "/app", title: "¿Qué días puedes trabajar?", body: `Aún no has respondido: ${poll.title}.`, tag: `sondeo-${id}` }),
    );
  }
  await auditAdmin(by, "Sondeo", "Recordatorio", `«${poll.title}»: recordatorio a ${pending.length} personas`, { entityId: id });
  revalidatePath(`/admin/sondeos/${id}`);
}

/** Al cerrarlo deja de aparecer en la app; los «No puedo» siguen marcados como no disponible. */
export async function closePoll(id: string) {
  const by = await requireAdmin();
  const p = await db.availabilityPoll.update({ where: { id }, data: { closedAt: new Date() } });
  await auditAdmin(by, "Sondeo", "Cerrado", `«${p.title}» cerrado`, { entityId: id });
  revalidatePath("/admin/sondeos");
  revalidatePath(`/admin/sondeos/${id}`);
}

/** Borra el sondeo y las no disponibilidades que puso (las marcadas a mano se mantienen). */
export async function deletePoll(id: string) {
  const by = await requireAdmin();
  const p = await db.availabilityPoll.findUniqueOrThrow({ where: { id }, include: { answers: { where: { available: false } } } });
  for (const a of p.answers) {
    await db.unavailability.deleteMany({ where: { workerId: a.workerId, date: a.date, reason: POLL_REASON } });
  }
  await db.availabilityPoll.delete({ where: { id } });
  await auditAdmin(by, "Sondeo", "Borrado", `«${p.title}» borrado`, { entityId: id });
  revalidatePath("/admin/sondeos");
  redirect("/admin/sondeos");
}
