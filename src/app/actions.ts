"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  checkPassword,
  createAdminSession,
  destroySession,
  newAccessCode,
  phoneKey,
  requireAdmin,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { forgetDevice } from "@/lib/devices";
import { callTime, EVENT_TYPES, formatDate, ROLE_LABEL, ROLES, type Role } from "@/lib/domain";
import { notify } from "@/lib/push";
import { candidatesFor, gaps } from "@/lib/staffing";
const time = z.string().regex(/^\d{2}:\d{2}$/);
const optTime = z.union([time, z.literal("")]).transform((v) => v || null);
const optText = z.string().trim().transform((v) => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optCoord = (max: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) > max) {
        ctx.addIssue({ code: "custom", message: "Ubicación no válida" });
        return z.NEVER;
      }
      return n;
    });

// ---------- Sesión ----------

export async function login(_prev: string | null, form: FormData) {
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (name.length < 2) return "Escribe tu nombre (aparece en el chat)";
  if (!checkPassword(String(form.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta
    return "Contraseña incorrecta";
  }
  await createAdminSession(name);
  redirect("/admin");
}

export async function logout() {
  await forgetDevice();
  await destroySession();
  redirect("/login");
}

// ---------- Avisos ----------

type EventInfo = { id: string; name: string; date: string; startTime: string; unloadTime: string | null };

/** Aviso de convocatoria a cada trabajador, tras responder a RRHH (no retrasa la pantalla). */
function notifyInvited(event: EventInfo, invited: { workerId: string; role: string }[]) {
  if (!invited.length) return;
  after(async () => {
    for (const role of ROLES) {
      const ids = invited.filter((i) => i.role === role).map((i) => i.workerId);
      await notify({
        workerIds: ids,
        workerUrl: `/app/eventos/${event.id}`,
        title: "Nueva convocatoria",
        body: `${event.name} · ${formatDate(event.date)} a las ${callTime(event, role)} (${ROLE_LABEL[role as Role].toLowerCase()}). Toca para aceptar o rechazar.`,
        tag: `inv-${event.id}`,
      });
    }
  });
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
  const key = phoneKey(parsed.data.phone);
  if (key.length < 9) return "El teléfono debe tener al menos 9 cifras";
  const clash = await db.worker.findUnique({ where: { phoneKey: key } });
  if (clash && clash.id !== id) return `Ese teléfono ya es de ${clash.name}`;
  const data = { ...parsed.data, phoneKey: key };
  const worker = id
    ? await db.worker.update({ where: { id }, data })
    : await db.worker.create({ data: { ...data, accessCode: newAccessCode() } });
  revalidatePath("/admin", "layout");
  redirect(`/admin/personal/${worker.id}`);
}

export async function toggleWorkerActive(id: string) {
  await requireAdmin();
  const w = await db.worker.findUniqueOrThrow({ where: { id } });
  await db.worker.update({ where: { id }, data: { active: !w.active } });
  if (w.active) await db.device.deleteMany({ where: { workerId: id } });
  revalidatePath("/admin", "layout");
}

/** Nuevo código de acceso: cierra la sesión en todos sus dispositivos. */
export async function regenerateAccessCode(id: string) {
  await requireAdmin();
  await db.worker.update({
    where: { id },
    data: { accessCode: newAccessCode(), sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  await db.device.deleteMany({ where: { workerId: id } });
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
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Hora de fin obligatoria (marca el cierre del fichaje)"),
  unloadTime: optTime,
  venue: z.string().trim().min(2, "Lugar obligatorio"),
  lat: optCoord(90),
  lng: optCoord(180),
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
  const before = id ? await db.event.findUniqueOrThrow({ where: { id } }) : null;
  const event = id
    ? await db.event.update({ where: { id }, data: parsed.data })
    : await db.event.create({ data: parsed.data });

  if (before) {
    const changes = [
      before.date !== event.date && `fecha: ${formatDate(event.date)}`,
      before.startTime !== event.startTime && `hora: ${event.startTime}`,
      before.unloadTime !== event.unloadTime && `descarga: ${event.unloadTime ?? "sin hora"}`,
      before.venue !== event.venue && `lugar: ${event.venue}`,
      before.endTime !== event.endTime && `hora de fin: ${event.endTime}`,
    ].filter(Boolean);
    if (changes.length) {
      after(async () => {
        const people = await db.assignment.findMany({
          where: { eventId: event.id, status: { in: ["CONVOCADO", "CONFIRMADO"] } },
          select: { workerId: true },
        });
        await notify({
          workerIds: people.map((p) => p.workerId),
          workerUrl: `/app/eventos/${event.id}`,
          title: `Cambios en ${event.name}`,
          body: `Nueva ${changes.join(", ")}`,
          tag: `upd-${event.id}`,
        });
      });
    }
  }
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
  const event = await db.event.findUniqueOrThrow({
    where: { id },
    include: { assignments: { where: { status: { in: ["CONVOCADO", "CONFIRMADO"] } }, select: { workerId: true } } },
  });
  await db.event.delete({ where: { id } });
  const workerIds = event.assignments.map((a) => a.workerId);
  after(() =>
    notify({
      workerIds,
      workerUrl: "/app",
      title: "Evento cancelado",
      body: `${event.name} del ${formatDate(event.date)} se ha cancelado.`,
      tag: `del-${id}`,
    }),
  );
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
  const invited = [];
  for (const id of ids) {
    const c = allowed.get(id);
    if (!c) continue;
    await db.assignment.upsert({
      where: { eventId_workerId: { eventId, workerId: id } },
      create: { eventId, workerId: id, role: c.role },
      update: { status: "CONVOCADO", role: c.role, respondedAt: null },
    });
    invited.push({ workerId: id, role: c.role });
  }
  notifyInvited(event, invited);
  revalidatePath(`/admin/eventos/${eventId}`);
}

/** Convoca automáticamente a los mejores candidatos hasta cubrir los huecos de cada puesto. */
export async function autoFill(eventId: string) {
  await requireAdmin();
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { assignments: true } });
  const missing = gaps(event, event.assignments);
  const candidates = await candidatesFor(event);
  const invited = [];
  for (const role of ROLES) {
    for (const c of candidates[role].slice(0, missing[role])) {
      await db.assignment.create({ data: { eventId, workerId: c.id, role } });
      invited.push({ workerId: c.id, role });
    }
  }
  notifyInvited(event, invited);
  revalidatePath(`/admin/eventos/${eventId}`);
}

export async function setAssignmentStatus(id: string, status: string) {
  await requireAdmin();
  if (!["CONVOCADO", "CONFIRMADO", "RECHAZADO", "CANCELADO"].includes(status)) return;
  const a = await db.assignment.update({
    where: { id },
    data: { status, respondedAt: status === "CONVOCADO" ? null : new Date() },
    include: { event: true },
  });
  if (status === "CONVOCADO") notifyInvited(a.event, [a]);
  if (status === "CANCELADO") {
    after(() =>
      notify({
        workerIds: [a.workerId],
        workerUrl: "/app",
        title: "Convocatoria cancelada",
        body: `Ya no te necesitamos en ${a.event.name} del ${formatDate(a.event.date)}. ¡Gracias!`,
        tag: `inv-${a.eventId}`,
      }),
    );
  }
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
    const newIn = checkIn.success ? checkIn.data : a.checkIn;
    const newOut = checkOut.success ? checkOut.data : a.checkOut;
    // Si RRHH cambia una hora, deja de ser un fichaje por GPS: se marca como manual
    const inChanged = newIn !== a.checkIn;
    const outChanged = newOut !== a.checkOut;
    await db.assignment.update({
      where: { id: a.id },
      data: {
        checkIn: newIn,
        checkOut: newOut,
        hoursOverride: hours != null && Number.isFinite(hours) && hours >= 0 ? hours : null,
        ...(inChanged && { checkInManual: newIn !== null, checkInLat: null, checkInLng: null, checkInDistance: null, checkInAccuracy: null }),
        ...(outChanged && { checkOutManual: newOut !== null, checkOutLat: null, checkOutLng: null, checkOutDistance: null, checkOutAccuracy: null }),
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
