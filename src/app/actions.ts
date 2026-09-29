"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkPassword, createSession, destroySession, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { EVENT_TYPES, ROLES } from "@/lib/domain";
import { candidatesFor, gaps } from "@/lib/staffing";

const newToken = () => randomBytes(18).toString("base64url");
const time = z.string().regex(/^\d{2}:\d{2}$/);
const optTime = z.union([time, z.literal("")]).transform((v) => v || null);
const optText = z.string().trim().transform((v) => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------- Sesión ----------

export async function login(_prev: string | null, form: FormData) {
  if (!checkPassword(String(form.get("password") ?? ""))) return "Contraseña incorrecta";
  await createSession();
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ---------- Personal ----------

const workerSchema = z.object({
  name: z.string().trim().min(2, "Nombre obligatorio"),
  phone: z.string().trim().min(6, "Teléfono obligatorio"),
  email: optText,
  role: z.enum(ROLES),
  rating: z.coerce.number().int().min(1).max(5),
  zone: optText,
  notes: optText,
});

export async function saveWorker(_prev: string | null, form: FormData) {
  await requireAdmin();
  const parsed = workerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const id = form.get("id") ? String(form.get("id")) : null;
  const worker = id
    ? await db.worker.update({ where: { id }, data: parsed.data })
    : await db.worker.create({ data: { ...parsed.data, token: newToken() } });
  revalidatePath("/admin", "layout");
  redirect(`/admin/personal/${worker.id}`);
}

export async function toggleWorkerActive(id: string) {
  await requireAdmin();
  const w = await db.worker.findUniqueOrThrow({ where: { id } });
  await db.worker.update({ where: { id }, data: { active: !w.active } });
  revalidatePath("/admin", "layout");
}

export async function regenerateToken(id: string) {
  await requireAdmin();
  await db.worker.update({ where: { id }, data: { token: newToken() } });
  revalidatePath(`/admin/personal/${id}`);
}

export async function deleteWorker(id: string) {
  await requireAdmin();
  await db.worker.delete({ where: { id } });
  revalidatePath("/admin", "layout");
  redirect("/admin/personal");
}

export async function addUnavailability(workerId: string, form: FormData) {
  await requireAdmin();
  const from = date.safeParse(form.get("from"));
  if (!from.success) return;
  const toRaw = date.safeParse(form.get("to"));
  const to = toRaw.success && toRaw.data >= from.data ? toRaw.data : from.data;
  const reason = String(form.get("reason") ?? "").trim() || null;
  const dates: string[] = [];
  for (let d = new Date(`${from.data}T12:00:00Z`); d.toISOString().slice(0, 10) <= to && dates.length < 366; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  for (const d of dates) {
    await db.unavailability.upsert({
      where: { workerId_date: { workerId, date: d } },
      create: { workerId, date: d, reason },
      update: { reason },
    });
  }
  revalidatePath(`/admin/personal/${workerId}`);
}

export async function removeUnavailability(id: string) {
  await requireAdmin();
  const u = await db.unavailability.delete({ where: { id } });
  revalidatePath(`/admin/personal/${u.workerId}`);
}

// ---------- Eventos ----------

const eventSchema = z.object({
  name: z.string().trim().min(2, "Nombre obligatorio"),
  type: z.enum(EVENT_TYPES),
  date: date,
  startTime: time,
  endTime: optTime,
  unloadTime: optTime,
  venue: z.string().trim().min(2, "Lugar obligatorio"),
  client: optText,
  notes: optText,
  needCamareros: z.coerce.number().int().min(0).max(500),
  needMaitres: z.coerce.number().int().min(0).max(100),
  needMozos: z.coerce.number().int().min(0).max(200),
});

export async function saveEvent(_prev: string | null, form: FormData) {
  await requireAdmin();
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const id = form.get("id") ? String(form.get("id")) : null;
  const event = id
    ? await db.event.update({ where: { id }, data: parsed.data })
    : await db.event.create({ data: parsed.data });
  revalidatePath("/admin", "layout");
  redirect(`/admin/eventos/${event.id}`);
}

export async function duplicateEvent(id: string) {
  await requireAdmin();
  const { id: _id, createdAt: _c, status: _s, ...data } = await db.event.findUniqueOrThrow({ where: { id } });
  const copy = await db.event.create({ data: { ...data, name: `${data.name} (copia)` } });
  redirect(`/admin/eventos/${copy.id}/editar`);
}

export async function setEventStatus(id: string, status: "ABIERTO" | "CERRADO") {
  await requireAdmin();
  await db.event.update({ where: { id }, data: { status } });
  revalidatePath("/admin", "layout");
}

export async function deleteEvent(id: string) {
  await requireAdmin();
  await db.event.delete({ where: { id } });
  revalidatePath("/admin", "layout");
  redirect("/admin/eventos");
}

// ---------- Convocatoria ----------

export async function inviteWorkers(eventId: string, form: FormData) {
  await requireAdmin();
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const ids = form.getAll("workerId").map(String);
  if (!ids.length) return;
  const available = Object.values(await candidatesFor(event)).flat();
  const allowed = new Map(available.map((c) => [c.id, c]));
  for (const id of ids) {
    const c = allowed.get(id);
    if (!c) continue;
    await db.assignment.upsert({
      where: { eventId_workerId: { eventId, workerId: id } },
      create: { eventId, workerId: id, role: c.role },
      update: { status: "CONVOCADO", role: c.role, respondedAt: null },
    });
  }
  revalidatePath(`/admin/eventos/${eventId}`);
}

/** Convoca automáticamente a los mejores candidatos hasta cubrir los huecos de cada puesto. */
export async function autoFill(eventId: string) {
  await requireAdmin();
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { assignments: true } });
  const missing = gaps(event, event.assignments);
  const candidates = await candidatesFor(event);
  for (const role of ROLES) {
    for (const c of candidates[role].slice(0, missing[role])) {
      await db.assignment.create({ data: { eventId, workerId: c.id, role } });
    }
  }
  revalidatePath(`/admin/eventos/${eventId}`);
}

export async function setAssignmentStatus(id: string, status: string) {
  await requireAdmin();
  if (!["CONVOCADO", "CONFIRMADO", "RECHAZADO", "CANCELADO"].includes(status)) return;
  const a = await db.assignment.update({
    where: { id },
    data: { status, respondedAt: status === "CONVOCADO" ? null : new Date() },
  });
  revalidatePath(`/admin/eventos/${a.eventId}`);
}

export async function removeAssignment(id: string) {
  await requireAdmin();
  const a = await db.assignment.delete({ where: { id } });
  revalidatePath(`/admin/eventos/${a.eventId}`);
}

// ---------- Fichaje ----------

export async function saveTimesheet(eventId: string, form: FormData) {
  await requireAdmin();
  const assignments = await db.assignment.findMany({ where: { eventId, status: "CONFIRMADO" } });
  for (const a of assignments) {
    const checkIn = optTime.safeParse(form.get(`in_${a.id}`) ?? "");
    const checkOut = optTime.safeParse(form.get(`out_${a.id}`) ?? "");
    const override = String(form.get(`hours_${a.id}`) ?? "").replace(",", ".").trim();
    const hours = override === "" ? null : Number(override);
    await db.assignment.update({
      where: { id: a.id },
      data: {
        checkIn: checkIn.success ? checkIn.data : a.checkIn,
        checkOut: checkOut.success ? checkOut.data : a.checkOut,
        hoursOverride: hours != null && Number.isFinite(hours) && hours >= 0 ? hours : null,
      },
    });
  }
  revalidatePath(`/admin/eventos/${eventId}`);
}

// ---------- Tarifas ----------

export async function saveRates(form: FormData) {
  await requireAdmin();
  for (const role of ROLES) {
    const hourlyRate = Number(String(form.get(`rate_${role}`) ?? "0").replace(",", "."));
    const minHours = Number(String(form.get(`min_${role}`) ?? "0").replace(",", "."));
    if (!Number.isFinite(hourlyRate) || !Number.isFinite(minHours)) continue;
    await db.rate.upsert({
      where: { role },
      create: { role, hourlyRate, minHours },
      update: { hourlyRate, minHours },
    });
  }
  revalidatePath("/admin", "layout");
}
