"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { mergeWorkers } from "@/lib/mergeWorkers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  adminLogin,
  checkSetupKey,
  createAdminSession,
  currentAdmin,
  hashPassword,
  normalizeEmail,
  destroySession,
  newAccessCode,
  phoneKey,
  requireAdmin,
} from "@/lib/auth";
import { auditAdmin, diff } from "@/lib/audit";
import { db } from "@/lib/db";
import { forgetDevice } from "@/lib/devices";
import { hireCandidate } from "@/lib/candidates";
import { DEFAULT_TEMPLATE, getCompany } from "@/lib/contracts";
import { sendAccessEmail } from "@/lib/mail";
import { reviewPhoto, uploadPhoto } from "@/lib/photo";
import { DEFAULT_PRIVACY_TEMPLATE, ensurePrivacyDoc, getPrivacy } from "@/lib/privacy";
import { addDocument } from "@/lib/documents";
import { createIncident, type IncidentResult } from "@/lib/incidents";
import { DOC_LABEL, lines, validDniNie, validIban } from "@/lib/staff";
import { checkIdentityDocs, storeIdentityDocs } from "@/lib/identityDocs";
import { EVENT_TYPE_LABEL, EVENT_TYPES, formatDate, isRole, LEAD_ROLES, OWN_RATE_ROLES, ROLE_LABEL, ROLES, type Role } from "@/lib/domain";
import { notify } from "@/lib/push";
import { autoReplace, candidatesFor, fillGaps, notifyInvited } from "@/lib/staffing";
import { deleteStoredFile } from "@/lib/files";
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
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const error = await adminLogin(email, String(form.get("password") ?? ""));
  await auditAdmin(email || "(sin email)", "Acceso", error ? "Acceso fallido" : "Acceso", error ? `Intento de acceso fallido: ${error}` : "Ha entrado en la gestión");
  if (error) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta
    return error;
  }
  redirect("/admin");
}

const userSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(60),
  email: z.string().trim().email("Email no válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
});

/** Primer arranque: crea el primer usuario de RRHH con la clave de instalación (ADMIN_PASSWORD). */
export async function setupFirstAdmin(_prev: string | null, form: FormData) {
  if ((await db.adminUser.count()) > 0) return "Ya hay usuarios de RRHH. Inicia sesión.";
  if (!checkSetupKey(String(form.get("setupKey") ?? ""))) {
    await new Promise((r) => setTimeout(r, 800));
    return "Clave de instalación incorrecta";
  }
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const user = await db.adminUser.create({
    data: { name: parsed.data.name, email: normalizeEmail(parsed.data.email), passwordHash: hashPassword(parsed.data.password) },
  });
  await createAdminSession(user);
  redirect("/admin");
}

// ---------- Usuarios de RRHH (todos con acceso completo) ----------

export async function createAdminUser(_prev: string | null, form: FormData) {
  await requireAdmin();
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const email = normalizeEmail(parsed.data.email);
  if (await db.adminUser.findUnique({ where: { email } })) return "Ya existe un usuario con ese email";
  await db.adminUser.create({ data: { name: parsed.data.name, email, passwordHash: hashPassword(parsed.data.password) } });
  await auditAdmin(await requireAdmin(), "Usuario de RRHH", "Alta", `Nuevo usuario de RRHH: ${parsed.data.name} (${email})`);
  revalidatePath("/admin/usuarios");
  return null;
}

export async function toggleAdminUser(id: string) {
  const me = await currentAdmin();
  if (!me) redirect("/login");
  if (id === me.id) return; // nadie se desactiva a sí mismo
  const u = await db.adminUser.findUniqueOrThrow({ where: { id } });
  await db.adminUser.update({ where: { id }, data: { active: !u.active, sessionVersion: { increment: 1 } } });
  await auditAdmin(me.name, "Usuario de RRHH", u.active ? "Desactivado" : "Activado", `${u.active ? "Desactivado" : "Activado"} el usuario de RRHH ${u.name}`, { entityId: id });
  if (u.active) await db.device.deleteMany({ where: { workerId: null, adminName: u.name } });
  revalidatePath("/admin/usuarios");
}

export async function resetAdminPassword(id: string, _prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return "Mínimo 8 caracteres";
  await db.adminUser.update({
    where: { id },
    data: { passwordHash: hashPassword(password), sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  const target = await db.adminUser.findUnique({ where: { id }, select: { name: true } });
  await auditAdmin(by, "Usuario de RRHH", "Contraseña", `Cambiada la contraseña de ${target?.name ?? id}`, { entityId: id });
  revalidatePath("/admin/usuarios");
  return "Contraseña cambiada. Sus sesiones abiertas se han cerrado.";
}

export async function changeMyPassword(_prev: string | null, form: FormData) {
  const me = await currentAdmin();
  if (!me) redirect("/login");
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return "La nueva contraseña debe tener al menos 8 caracteres";
  if (await adminLogin(me.email, current)) return "La contraseña actual no es correcta";
  const updated = await db.adminUser.update({
    where: { id: me.id },
    data: { passwordHash: hashPassword(password), sessionVersion: { increment: 1 } },
  });
  await createAdminSession(updated); // sigue con sesión en este navegador; el resto se cierran
  return "Contraseña cambiada. Se han cerrado tus sesiones en otros dispositivos.";
}

export async function logout() {
  await forgetDevice();
  await destroySession();
  redirect("/login");
}

// ---------- Personal ----------

const workerSchema = z.object({
  name: z.string().trim().min(2, "Nombre obligatorio"),
  phone: optText,
  email: optText,
  role: z.enum(ROLES),
  rating: z.coerce.number().int().min(1).max(5),
  zone: optText,
  notes: optText,
  dni: optText,
  nss: optText,
  iban: optText,
  birthDate: optText,
  address: optText,
  a3Code: optText,
  contractCode: z.enum(["300", "100", "200"]).default("300"),
  monthlySalary: z.preprocess((v) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(",", "."))), z.number().min(0, "Nómina no válida").max(20000, "Nómina no válida").nullable()),
});

const WORKER_LABELS = {
  name: "Nombre", phone: "Teléfono", email: "Email", role: "Puesto", roles: "Puestos", rating: "Valoración", zone: "Zona",
  dni: "DNI", nss: "NSS", iban: "IBAN", birthDate: "Nacimiento", address: "Dirección", a3Code: "Código A3", carSeats: "Plazas en coche", customRates: "Tarifa propia",
  contractCode: "Contrato", noClock: "No ficha", monthlySalary: "Nómina mensual",
};

export async function saveWorker(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const parsed = workerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const id = form.get("id") ? String(form.get("id")) : null;
  const key = parsed.data.phone ? phoneKey(parsed.data.phone) : null;
  if (key !== null && key.length < 9) return "El teléfono debe tener al menos 9 cifras";
  if (!key && !parsed.data.email) return "Pon el teléfono o, si no tiene, el email (para que pueda entrar en la app)";
  if (parsed.data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.data.email)) return "El email no es válido";
  if (parsed.data.dni) parsed.data.dni = parsed.data.dni.toUpperCase().replace(/[\s-]/g, "");
  if (parsed.data.iban) parsed.data.iban = parsed.data.iban.toUpperCase().replace(/\s/g, "");
  if (parsed.data.nss) parsed.data.nss = parsed.data.nss.replace(/\D/g, "");
  if (parsed.data.dni && !validDniNie(parsed.data.dni)) return "El DNI/NIE no es correcto (revisa la letra)";
  if (parsed.data.iban && !validIban(parsed.data.iban)) return "El IBAN no es correcto";
  const clash = key ? await db.worker.findUnique({ where: { phoneKey: key } }) : null;
  if (clash && clash.id !== id) return `Ese teléfono ya es de ${clash.name}`;
  const sameDni = parsed.data.dni ? await db.worker.findFirst({ where: { dni: parsed.data.dni, NOT: id ? { id } : undefined }, select: { name: true } }) : null;
  if (sameDni) return `Ese DNI ya es de ${sameDni.name}. Si es la misma persona, únelas en Personal → Repetidos.`;
  // Puestos que puede desempeñar: los marcados más el principal
  const roles = [...new Set([parsed.data.role, ...form.getAll("roles").map(String).filter(isRole)])];
  const customRates = rateMap(form, "own_", OWN_RATE_ROLES);
  const fixed = parsed.data.contractCode !== "300";
  const data = {
    ...parsed.data,
    roles, phoneKey: key, customRates: customRates ?? Prisma.DbNull,
    // «No ficha» y la nómina mensual solo tienen sentido en un fijo
    noClock: fixed && form.get("noClock") === "1",
    monthlySalary: fixed ? parsed.data.monthlySalary : null,
  };
  const before = id ? await db.worker.findUnique({ where: { id } }) : null;
  const docError = await checkIdentityDocs(id, before, parsed.data, form);
  if (docError) return docError;
  const worker = id
    ? await db.worker.update({ where: { id }, data })
    : await db.worker.create({ data: { ...data, accessCode: newAccessCode() } });
  let storedDocs: string[];
  try {
    storedDocs = await storeIdentityDocs(worker.id, form, by, true);
  } catch (e) {
    return (e as Error).message;
  }
  if (storedDocs.length) await auditAdmin(by, "Documento", "Subido", `${worker.name}: ${storedDocs.map((t) => DOC_LABEL[t] ?? t).join(", ")}`, { entityId: worker.id });
  const d = diff(before, worker, WORKER_LABELS);
  if (!before) await auditAdmin(by, "Trabajador", "Alta", `Nueva ficha: ${worker.name}`, { entityId: worker.id });
  else if (d.changed) await auditAdmin(by, "Trabajador", "Datos", `${worker.name}: ${d.text}`, { entityId: worker.id, data: d.data });
  revalidatePath("/admin", "layout");
  redirect(`/admin/personal/${worker.id}`);
}

export async function toggleWorkerActive(id: string) {
  const by = await requireAdmin();
  const w = await db.worker.findUniqueOrThrow({ where: { id } });
  await db.worker.update({ where: { id }, data: { active: !w.active } });
  await auditAdmin(by, "Trabajador", w.active ? "Desactivado" : "Activado", `${w.active ? "Desactivado" : "Reactivado"}: ${w.name}`, { entityId: id });
  if (w.active) await db.device.deleteMany({ where: { workerId: id } });
  revalidatePath("/admin", "layout");
}

/** Nuevo código de acceso: cierra la sesión en todos sus dispositivos. */
/** Envía por email el código de acceso del trabajador. */
export async function emailAccessCode(id: string, _prev: string | null): Promise<string | null> {
  const by = await requireAdmin();
  const w = await db.worker.findUniqueOrThrow({ where: { id } });
  const err = await sendAccessEmail(w);
  if (err) return err;
  await auditAdmin(by, "Trabajador", "Código por email", `Código de acceso enviado a ${w.email}`, { entityId: id });
  return `Enviado a ${w.email}.`;
}

// ---------- Foto de perfil ----------

export async function reviewPhotoAction(workerId: string, accept: boolean, form: FormData) {
  const by = await requireAdmin();
  await reviewPhoto(workerId, accept, accept ? null : String(form.get("reason") ?? ""), by);
  revalidatePath("/admin", "layout");
}

export async function adminUploadPhoto(workerId: string, _prev: string | null, form: FormData): Promise<string | null> {
  const by = await requireAdmin();
  const file = form.get("photo");
  if (!(file instanceof File) || !file.size) return "Elige una foto.";
  try {
    await uploadPhoto(workerId, file, { name: by, admin: true });
  } catch (e) {
    return (e as Error).message;
  }
  revalidatePath(`/admin/personal/${workerId}`);
  return "Foto guardada.";
}

export async function regenerateAccessCode(id: string) {
  const by = await requireAdmin();
  const w = await db.worker.update({
    where: { id },
    data: { accessCode: newAccessCode(), sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  await db.device.deleteMany({ where: { workerId: id } });
  await auditAdmin(by, "Trabajador", "Código de acceso", `Nuevo código de acceso para ${w.name} (se cierran sus sesiones)`, { entityId: id });
  revalidatePath(`/admin/personal/${id}`);
}

export async function deleteWorker(id: string) {
  const by = await requireAdmin();
  const w = await db.worker.delete({ where: { id } });
  await auditAdmin(by, "Trabajador", "Borrado", `Borrada la ficha de ${w.name}${w.dni ? ` (${w.dni})` : ""}`, { entityId: id });
  revalidatePath("/admin", "layout");
  redirect("/admin/personal");
}

/** Dar de baja o borrar a varios trabajadores a la vez (lista de Personal). */
export async function bulkWorkers(_prev: string | null, form: FormData): Promise<string | null> {
  const by = await requireAdmin();
  const ids = [...new Set(form.getAll("ids").map(String))].slice(0, 2000);
  const action = String(form.get("accion") ?? "");
  if (!ids.length) return "No has seleccionado a nadie.";
  if (action.startsWith("contrato:")) {
    // Fijo: se mantiene el 100 o 200 que ya tuviera (si no, 100); «sin fichaje» = no ficha
    const kind = action.slice(9);
    const workers = await db.worker.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, contractCode: true } });
    for (const w of workers) {
      const contractCode = kind === "300" ? "300" : w.contractCode === "200" ? "200" : "100";
      await db.worker.update({ where: { id: w.id }, data: { contractCode, noClock: kind === "fijo-sin", ...(kind === "300" && { monthlySalary: null }) } });
    }
    const label = kind === "300" ? "extra (300)" : kind === "fijo" ? "fijo" : "fijo sin fichaje";
    if (workers.length) await auditAdmin(by, "Trabajador", "Contrato", `Marcados como ${label} ${workers.length}: ${workers.map((w) => w.name).join(", ")}`.slice(0, 1000));
    revalidatePath("/admin", "layout");
    return `${workers.length} marcados como ${label}.`;
  }
  if (action === "desactivar") {
    const workers = await db.worker.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true } });
    await db.worker.updateMany({ where: { id: { in: workers.map((w) => w.id) } }, data: { active: false } });
    await db.device.deleteMany({ where: { workerId: { in: workers.map((w) => w.id) } } });
    if (workers.length) await auditAdmin(by, "Trabajador", "Desactivados", `Dados de baja ${workers.length}: ${workers.map((w) => w.name).join(", ")}`.slice(0, 1000));
    revalidatePath("/admin", "layout");
    return `${workers.length} dados de baja.`;
  }
  if (action !== "borrar") return null;
  // Quien ya tiene pagos cerrados o pagados no se borra: se perdería el histórico de nóminas
  const withPay = await db.worker.findMany({
    where: { id: { in: ids }, payLines: { some: { period: { status: { not: "ABIERTA" } } } } },
    select: { id: true, name: true },
  });
  const keep = new Set(withPay.map((w) => w.id));
  const victims = await db.worker.findMany({ where: { id: { in: ids.filter((id) => !keep.has(id)) } }, select: { id: true, name: true, dni: true } });
  await db.worker.deleteMany({ where: { id: { in: victims.map((w) => w.id) } } });
  if (victims.length) await auditAdmin(by, "Trabajador", "Borrados", `Borradas ${victims.length} fichas: ${victims.map((w) => `${w.name}${w.dni ? ` (${w.dni})` : ""}`).join(", ")}`.slice(0, 1000));
  revalidatePath("/admin", "layout");
  return `${victims.length} borrados.${withPay.length ? ` No se han borrado (tienen pagos registrados; dalos de baja): ${withPay.map((w) => w.name).join(", ")}.` : ""}`;
}

export async function mergeWorkersAction(_prev: string | null, form: FormData): Promise<string | null> {
  const by = await requireAdmin();
  const keep = String(form.get("keep") ?? "");
  const ids = form.getAll("ids").map(String).filter((id) => id && id !== keep);
  if (!keep || !ids.length) return "Elige la ficha que se queda.";
  const done: string[] = [];
  let keepName = "";
  try {
    for (const id of ids) {
      const r = await mergeWorkers(keep, id, by);
      done.push(r.removed);
      keepName = r.kept;
    }
  } catch (e) {
    return (e as Error).message;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/personal/repetidos?ok=${encodeURIComponent(`Unidas: ${done.join(", ")} → ${keepName}.`)}`);
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
  salesRep: optText,
  budget: z
    .string()
    .optional()
    .transform((v) => {
      const t = (v ?? "").trim().replace(/[€\s]/g, "");
      return t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t; // «1.500,50» o «1500.50»
    })
    .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1e7), "Presupuesto no válido")
    .transform((v) => (v === "" ? null : Math.round(Number(v) * 100) / 100)),
  budgetNote: optText,
  notes: optText,
  checklist: optText,
  needCamareros: z.coerce.number().int().min(0).max(500),
  needMaitres: z.coerce.number().int().min(0).max(100),
  needResponsables: z.coerce.number().int().min(0).max(20),
  autoReplace: z.string().optional().transform((v) => v === "1"),
  needMozos: z.coerce.number().int().min(0).max(200),
});

/**
 * Finca y cliente del evento: se enlazan los guardados que se hayan elegido y, si se pide,
 * se guardan los nuevos. Si la finca tiene punto y el evento no, se usa el de la finca.
 */
async function linkVenueAndClient(form: FormData, ev: { venue: string; client: string | null; lat: number | null; lng: number | null }) {
  let venueId = String(form.get("venueId") ?? "") || null;
  let clientId = String(form.get("clientId") ?? "") || null;
  const extra: { lat?: number; lng?: number } = {};
  if (venueId) {
    const venue = await db.venue.findUnique({ where: { id: venueId } });
    if (!venue) venueId = null;
    else if (ev.lat == null && venue.lat != null && venue.lng != null) Object.assign(extra, { lat: venue.lat, lng: venue.lng });
  } else if (form.get("saveVenue") === "1") {
    venueId = (
      await db.venue.upsert({
        where: { name: ev.venue },
        create: { name: ev.venue, lat: ev.lat, lng: ev.lng },
        update: ev.lat != null ? { lat: ev.lat, lng: ev.lng } : {},
      })
    ).id;
  }
  if (clientId) {
    if (!(await db.client.findUnique({ where: { id: clientId } }))) clientId = null;
  } else if (form.get("saveClient") === "1" && ev.client) {
    clientId = (await db.client.upsert({ where: { name: ev.client }, create: { name: ev.client }, update: {} })).id;
  }
  return { venueId, clientId, ...extra };
}

export async function saveEvent(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const id = form.get("id") ? String(form.get("id")) : null;
  const before = id ? await db.event.findUniqueOrThrow({ where: { id } }) : null;
  const data = { ...parsed.data, ...(await linkVenueAndClient(form, parsed.data)) };
  const event = id ? await db.event.update({ where: { id }, data }) : await db.event.create({ data });
  const ed = diff(before, event, { name: "Nombre", date: "Fecha", startTime: "Inicio", endTime: "Fin", unloadTime: "Descarga", venue: "Lugar", client: "Cliente", salesRep: "Comercial", budget: "Presupuesto", budgetNote: "Comentario presupuesto", needCamareros: "Camareros", needMaitres: "Maîtres", needResponsables: "Responsables", needMozos: "Mozos" });
  if (!before) await auditAdmin(by, "Evento", "Alta", `Nuevo evento: ${event.name} (${formatDate(event.date)})`, { entityId: event.id });
  else if (ed.changed) await auditAdmin(by, "Evento", "Cambios", `${event.name}: ${ed.text}`, { entityId: event.id, data: ed.data });

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

// ---------- Plantillas, fincas y clientes ----------

export async function saveAsTemplate(eventId: string, _prev: string | null, form: FormData) {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) return "Ponle un nombre a la plantilla";
  const e = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const data = {
    type: e.type,
    startTime: e.startTime,
    endTime: e.endTime ?? e.startTime,
    unloadTime: e.unloadTime,
    needCamareros: e.needCamareros,
    needResponsables: e.needResponsables,
    needMaitres: e.needMaitres,
    needMozos: e.needMozos,
    notes: e.notes,
    checklist: e.checklist,
    venueId: e.venueId,
  };
  await db.eventTemplate.upsert({ where: { name }, create: { name, ...data }, update: data });
  revalidatePath("/admin/plantillas");
  return `Plantilla «${name}» guardada`;
}

export async function deleteTemplate(id: string) {
  await requireAdmin();
  await db.eventTemplate.delete({ where: { id } });
  revalidatePath("/admin/plantillas");
}

const optional = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const optNumber = (v: FormDataEntryValue | null, max: number) => {
  const n = Number(v);
  return v !== null && String(v).trim() !== "" && Number.isFinite(n) && Math.abs(n) <= max ? n : null;
};

export async function saveVenue(_prev: string | null, form: FormData) {
  await requireAdmin();
  const id = optional(form.get("id"));
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return "Nombre obligatorio";
  const clash = await db.venue.findUnique({ where: { name } });
  if (clash && clash.id !== id) return "Ya hay una finca con ese nombre";
  const data = {
    name,
    address: optional(form.get("address")),
    accessNotes: optional(form.get("accessNotes")),
    contactName: optional(form.get("contactName")),
    contactPhone: optional(form.get("contactPhone")),
    lat: optNumber(form.get("lat"), 90),
    lng: optNumber(form.get("lng"), 180),
  };
  const venue = id ? await db.venue.update({ where: { id }, data }) : await db.venue.create({ data });
  // Eventos futuros de esta finca sin punto fijado: se les pone el de la finca
  if (venue.lat != null && venue.lng != null) {
    await db.event.updateMany({
      where: { venueId: venue.id, lat: null, date: { gte: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date()) } },
      data: { lat: venue.lat, lng: venue.lng },
    });
  }
  revalidatePath("/admin/fincas");
  redirect("/admin/fincas");
}

export async function deleteVenue(id: string) {
  await requireAdmin();
  await db.venue.delete({ where: { id } });
  revalidatePath("/admin/fincas");
}

export async function saveClient(_prev: string | null, form: FormData) {
  await requireAdmin();
  const id = optional(form.get("id"));
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return "Nombre obligatorio";
  const clash = await db.client.findUnique({ where: { name } });
  if (clash && clash.id !== id) return "Ya hay un cliente con ese nombre";
  const data = {
    name,
    contact: optional(form.get("contact")),
    phone: optional(form.get("phone")),
    email: optional(form.get("email")),
    notes: optional(form.get("notes")),
  };
  if (id) await db.client.update({ where: { id }, data });
  else await db.client.create({ data });
  revalidatePath("/admin/clientes");
  redirect("/admin/clientes");
}

export async function deleteClient(id: string) {
  await requireAdmin();
  await db.client.delete({ where: { id } });
  revalidatePath("/admin/clientes");
}

export async function duplicateEvent(id: string) {
  await requireAdmin();
  const { id: _id, createdAt: _c, status: _s, ...data } = await db.event.findUniqueOrThrow({ where: { id } });
  const copy = await db.event.create({ data: { ...data, name: `${data.name} (copia)` } });
  redirect(`/admin/eventos/${copy.id}/editar`);
}

export async function setEventStatus(id: string, status: "ABIERTO" | "CERRADO") {
  const by = await requireAdmin();
  const e = await db.event.update({ where: { id }, data: { status } });
  await auditAdmin(by, "Evento", status === "CERRADO" ? "Cerrado" : "Reabierto", `${e.name}: ${status === "CERRADO" ? "cerrado" : "reabierto"}`, { entityId: id });
  revalidatePath("/admin", "layout");
}

export async function deleteEvent(id: string) {
  const by = await requireAdmin();
  const event = await db.event.findUniqueOrThrow({
    where: { id },
    include: { assignments: { where: { status: { in: ["CONVOCADO", "CONFIRMADO"] } }, select: { workerId: true } } },
  });
  await db.event.delete({ where: { id } });
  await auditAdmin(by, "Evento", "Borrado", `Borrado el evento ${event.name} (${formatDate(event.date)}) con ${event.assignments.length} personas convocadas o confirmadas`, { entityId: id });
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

/** Convoca a los seleccionados para un puesto concreto (un mismo trabajador puede valer para varios). */
export async function inviteWorkers(eventId: string, role: Role, form: FormData) {
  await requireAdmin();
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const ids = form.getAll("workerId").map(String);
  if (!ids.length || !isRole(role)) return;
  const allowed = new Set((await candidatesFor(event))[role].map((c) => c.id));
  const invited = [];
  for (const id of ids) {
    if (!allowed.has(id)) continue;
    await db.assignment.upsert({
      where: { eventId_workerId: { eventId, workerId: id } },
      create: { eventId, workerId: id, role },
      update: { status: "CONVOCADO", role, respondedAt: null },
    });
    invited.push({ workerId: id, role });
  }
  notifyInvited(event, invited);
  revalidatePath(`/admin/eventos/${eventId}`);
}

/** Convoca automáticamente a los mejores candidatos hasta cubrir los huecos de cada puesto. */
export async function autoFill(eventId: string) {
  await requireAdmin();
  await fillGaps(eventId);
  revalidatePath(`/admin/eventos/${eventId}`);
}

export async function setAssignmentStatus(id: string, status: string) {
  const by = await requireAdmin();
  if (!["CONVOCADO", "CONFIRMADO", "RECHAZADO", "CANCELADO"].includes(status)) return;
  const a = await db.assignment.update({
    where: { id },
    data: { status, respondedAt: status === "CONVOCADO" ? null : new Date() },
    include: { event: true, worker: { select: { name: true } } },
  });
  await auditAdmin(by, "Convocatoria", "Estado", `${a.worker.name} en ${a.event.name} (${formatDate(a.event.date)}): ${status.toLowerCase()}`, { entityId: a.eventId });
  if (status === "CONVOCADO") notifyInvited(a.event, [a]);
  // Si RRHH anota que alguien no puede ir (p. ej. avisó por teléfono), también se busca sustituto
  if (status === "RECHAZADO" && isRole(a.role)) after(() => autoReplace(a.eventId, a.role as Role, a.worker.name));
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
  const by = await requireAdmin();
  const a = await db.assignment.delete({ where: { id }, include: { worker: { select: { name: true } }, event: { select: { name: true } } } });
  await auditAdmin(by, "Convocatoria", "Quitada", `Quitado ${a.worker.name} de ${a.event.name}`, { entityId: a.eventId });
  revalidatePath(`/admin/eventos/${a.eventId}`);
}

/** Aviso al maître o camarero responsable para que valore a su equipo. */
export async function remindReviews(eventId: string) {
  await requireAdmin();
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { assignments: { where: { status: "CONFIRMADO", role: { in: [...LEAD_ROLES] } }, select: { workerId: true } } },
  });
  await notify({
    workerIds: event.assignments.map((a) => a.workerId),
    workerUrl: `/app/eventos/${eventId}/valorar`,
    title: "Valora a tu equipo",
    body: `RRHH te recuerda que falta valorar al personal de ${event.name}.`,
    tag: `rev-${eventId}`,
  });
}

// ---------- Documentos, material, cambios de turno y uniforme ----------

export async function adminUploadDocument(workerId: string, _prev: { ok: boolean; message: string } | null, form: FormData) {
  const name = await requireAdmin();
  const r = await addDocument(workerId, form, `${name} (RRHH)`, true);
  revalidatePath(`/admin/personal/${workerId}`);
  return r.ok ? { ok: true, message: "Documento añadido." } : r;
}

export async function verifyDocument(id: string) {
  const by = await requireAdmin();
  const d = await db.workerDocument.update({ where: { id }, data: { verified: true }, include: { worker: { select: { name: true } } } });
  await auditAdmin(by, "Documento", "Revisado", `${d.worker.name}: documento ${d.type} revisado`, { entityId: d.workerId });
  revalidatePath(`/admin/personal/${d.workerId}`);
  revalidatePath("/admin/documentos");
}

/** Marca como revisados todos los documentos pendientes de una persona. */
export async function verifyAllDocuments(workerId: string) {
  const by = await requireAdmin();
  const r = await db.workerDocument.updateMany({ where: { workerId, verified: false }, data: { verified: true } });
  const w = await db.worker.findUnique({ where: { id: workerId }, select: { name: true } });
  if (r.count) await auditAdmin(by, "Documento", "Revisado", `${w?.name}: ${r.count} documentos revisados`, { entityId: workerId });
  revalidatePath("/admin", "layout");
}

/** Rechaza un documento (borroso, caducado, no corresponde…): se borra y se avisa a la persona para que lo suba de nuevo. */
export async function rejectDocument(id: string, form: FormData) {
  const by = await requireAdmin();
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200) || "No es válido";
  const d = await db.workerDocument.delete({ where: { id }, include: { worker: { select: { name: true } } } });
  if (d.fileId) await deleteStoredFile(d.fileId);
  const what = DOC_LABEL[d.type] ?? "Un documento";
  await auditAdmin(by, "Documento", "Rechazado", `${d.worker.name}: ${what} rechazado (${reason})`, { entityId: d.workerId });
  after(() =>
    notify({
      workerIds: [d.workerId],
      workerUrl: "/app/perfil",
      title: "Documento rechazado",
      body: `${what}: ${reason}. Súbelo de nuevo desde tu perfil.`,
      tag: `doc-${d.workerId}`,
    }),
  );
  revalidatePath("/admin", "layout");
}

export async function deleteDocument(id: string) {
  const by = await requireAdmin();
  const d = await db.workerDocument.delete({ where: { id }, include: { worker: { select: { name: true } } } });
  await auditAdmin(by, "Documento", "Borrado", `${d.worker.name}: borrado documento ${d.type}`, { entityId: d.workerId });
  if (d.fileId) await deleteStoredFile(d.fileId);
  revalidatePath(`/admin/personal/${d.workerId}`);
}

export async function addLoan(workerId: string, form: FormData) {
  await requireAdmin();
  const item = String(form.get("item") ?? "").trim().slice(0, 100);
  const quantity = Math.max(1, Math.min(99, Number(form.get("quantity")) || 1));
  const deliveredAt = String(form.get("deliveredAt") ?? "");
  if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(deliveredAt)) return;
  await db.loan.create({ data: { workerId, item, quantity, deliveredAt, notes: String(form.get("notes") ?? "").trim() || null } });
  revalidatePath(`/admin/personal/${workerId}`);
}

export async function returnLoan(id: string) {
  await requireAdmin();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const l = await db.loan.update({ where: { id }, data: { returnedAt: today } });
  revalidatePath(`/admin/personal/${l.workerId}`);
}

export async function deleteLoan(id: string) {
  await requireAdmin();
  const l = await db.loan.delete({ where: { id } });
  revalidatePath(`/admin/personal/${l.workerId}`);
}

export async function saveUniform(form: FormData) {
  await requireAdmin();
  const value = Object.fromEntries(ROLES.map((r) => [r, lines(String(form.get(r) ?? "")).slice(0, 30)]));
  await db.setting.upsert({ where: { key: "uniforme" }, create: { key: "uniforme", value }, update: { value } });
  revalidatePath("/admin/ajustes/uniforme");
}

// ---------- Contratos y ajustes de empresa ----------

export async function deleteContract(id: string) {
  const by = await requireAdmin();
  const c = await db.contract.delete({ where: { id }, include: { worker: { select: { name: true } } } });
  await auditAdmin(by, "Documento", "Anulado", `Anulado «${c.title}» de ${c.worker.name}`, { entityId: c.workerId });
  if (c.signatureFileId) await deleteStoredFile(c.signatureFileId);
  revalidatePath(`/admin/eventos/${c.eventId}`);
}

export async function saveCompany(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const before = await getCompany();
  const template = form.has("template") ? get("template").replace(/\r\n/g, "\n") : before.template;
  const value = {
    name: get("name"),
    cif: get("cif").toUpperCase(),
    address: get("address"),
    city: get("city"),
    agreement: get("agreement"),
    template: template === DEFAULT_TEMPLATE.trim() ? "" : template,
  };
  await db.setting.upsert({ where: { key: "empresa" }, create: { key: "empresa", value }, update: { value } });
  await auditAdmin(by, "Ajustes", "Empresa", `Datos de empresa guardados (${value.name || "sin razón social"}, ${value.cif || "sin CIF"})`);
  revalidatePath("/admin/ajustes/empresa");
  return "Guardado.";
}

export async function savePrivacy(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const current = await getPrivacy();
  const email = String(form.get("email") ?? "").trim();
  const text = String(form.get("template") ?? "").replace(/\r\n/g, "\n").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "El email no es válido.";
  const bump = form.get("newVersion") === "1";
  const value = { email, template: text === DEFAULT_PRIVACY_TEMPLATE.trim() ? "" : text, version: current.version + (bump ? 1 : 0) };
  await db.setting.upsert({ where: { key: "privacidad" }, create: { key: "privacidad", value }, update: { value } });
  await auditAdmin(by, "Ajustes", "Protección de datos", bump ? `Publicada la versión ${value.version} de la cláusula de protección de datos` : "Guardada la cláusula de protección de datos");
  // Los documentos sin firmar de versiones anteriores ya no sirven
  await db.contract.deleteMany({ where: { kind: "RGPD", signedAt: null, version: { not: value.version } } });
  let asked = 0;
  if (bump) {
    // Quien firmó la versión anterior tiene que firmar la nueva
    const signed = await db.contract.findMany({ where: { kind: "RGPD", signedAt: { not: null }, worker: { active: true } }, select: { workerId: true }, distinct: ["workerId"] });
    for (const { workerId } of signed) await ensurePrivacyDoc(workerId);
    asked = signed.length;
    if (asked) {
      after(() =>
        notify({
          workerIds: signed.map((x) => x.workerId),
          workerUrl: "/app",
          title: "Protección de datos",
          body: "Hemos actualizado la información sobre protección de datos. Léela y fírmala en la app.",
          tag: "rgpd",
        }),
      );
    }
  }
  revalidatePath("/admin/ajustes/empresa");
  return bump ? `Nueva versión publicada. Se ha pedido la firma a ${asked} personas.` : "Guardado. Se aplica a las próximas firmas.";
}

export async function saveA3(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const roleConcepts = Object.fromEntries(ROLES.map((r) => [r, get(`concept_${r}`)]).filter(([, v]) => v));
  const value = { companyCode: get("companyCode"), hoursConcept: get("hoursConcept"), hoursConceptName: get("hoursConceptName") || "Horas eventos", roleConcepts, bonusConcept: get("bonusConcept") };
  if (!value.companyCode || !value.hoursConcept) return "Indica el código de empresa y el código de concepto de A3.";
  await db.setting.upsert({ where: { key: "a3" }, create: { key: "a3", value }, update: { value } });
  await auditAdmin(by, "Ajustes", "A3", `Configuración de A3: empresa ${value.companyCode}, concepto ${value.hoursConcept}`);
  revalidatePath("/admin/ajustes/a3");
  return "Configuración de A3 guardada.";
}

export async function saveA3Codes(form: FormData) {
  await requireAdmin();
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("a3_")) continue;
    await db.worker.update({ where: { id: k.slice(3) }, data: { a3Code: String(v).trim() || null } });
  }
  revalidatePath("/admin/ajustes/a3");
}

// ---------- Candidatos ----------

/** Al abrir un candidato deja de contar como nuevo (para todo RRHH) y se actualiza el número del menú. */
export async function markCandidateSeen(id: string) {
  await requireAdmin();
  const r = await db.candidate.updateMany({ where: { id, seenAt: null }, data: { seenAt: new Date() } });
  if (r.count) revalidatePath("/admin", "layout");
}

export async function updateCandidate(id: string, form: FormData) {
  await requireAdmin();
  const status = String(form.get("status") ?? "");
  const c = await db.candidate.findUniqueOrThrow({ where: { id } });
  await db.candidate.update({
    where: { id },
    data: {
      notes: String(form.get("notes") ?? "").trim() || null,
      ...(c.status !== "CONTRATADO" && ["NUEVO", "CONTACTADO", "DESCARTADO"].includes(status) && { status }),
    },
  });
  revalidatePath("/admin/candidatos", "layout");
}

export async function hireCandidateAction(id: string, form: FormData) {
  const by = await requireAdmin();
  const role = String(form.get("role") ?? "");
  if (!isRole(role)) return;
  const worker = await hireCandidate(id, role);
  await auditAdmin(by, "Trabajador", "Alta desde candidatos", `${worker.name} dado de alta desde Candidatos`, { entityId: worker.id });
  let email = "";
  if (form.get("sendEmail") === "1") {
    const err = await sendAccessEmail(worker);
    if (!err) await auditAdmin(by, "Trabajador", "Código por email", `Código de acceso enviado a ${worker.email}`, { entityId: worker.id });
    email = err ? `?email=${encodeURIComponent(err)}` : "?email=ok";
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/personal/${worker.id}${email}`);
}

export async function deleteCandidate(id: string) {
  await requireAdmin();
  const c = await db.candidate.delete({ where: { id } });
  if (c.fileId) await deleteStoredFile(c.fileId);
  revalidatePath("/admin/candidatos");
  redirect("/admin/candidatos");
}

// ---------- Incidencias ----------

export async function reportIncidentAdmin(eventId: string, _prev: IncidentResult | null, form: FormData): Promise<IncidentResult> {
  const name = await requireAdmin();
  const r = await createIncident({ kind: "admin", name }, eventId, form);
  revalidatePath(`/admin/eventos/${eventId}/directo`);
  return r;
}

export async function resolveIncident(id: string, form: FormData) {
  const name = await requireAdmin();
  const resolution = String(form.get("resolution") ?? "").trim().slice(0, 1000);
  const i = await db.incident.update({
    where: { id },
    data: { resolved: true, resolution: resolution ? `${resolution} (${name})` : `Cerrada por ${name}` },
  });
  revalidatePath(`/admin/eventos/${i.eventId}/directo`);
  revalidatePath("/admin/incidencias");
}

export async function reopenIncident(id: string) {
  await requireAdmin();
  const i = await db.incident.update({ where: { id }, data: { resolved: false, resolution: null } });
  revalidatePath(`/admin/eventos/${i.eventId}/directo`);
  revalidatePath("/admin/incidencias");
}

// ---------- Fichaje ----------

export async function saveTimesheet(eventId: string, form: FormData) {
  const by = await requireAdmin();
  const assignments = await db.assignment.findMany({ where: { eventId, status: "CONFIRMADO" }, include: { worker: { select: { name: true } }, event: { select: { name: true, date: true } } } });
  const changes: string[] = [];
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
    const newHours = hours != null && Number.isFinite(hours) && hours >= 0 ? hours : null;
    const parts = [
      inChanged && `entrada ${a.checkIn ?? "—"} → ${newIn ?? "—"}`,
      outChanged && `salida ${a.checkOut ?? "—"} → ${newOut ?? "—"}`,
      newHours !== a.hoursOverride && `horas manuales ${a.hoursOverride ?? "—"} → ${newHours ?? "—"}`,
    ].filter(Boolean);
    if (parts.length) changes.push(`${a.worker.name}: ${parts.join(", ")}`);
    await db.assignment.update({
      where: { id: a.id },
      data: {
        checkIn: newIn,
        checkOut: newOut,
        hoursOverride: newHours,
        ...(inChanged && { checkInManual: newIn !== null, checkInOffline: false, checkInLat: null, checkInLng: null, checkInDistance: null, checkInAccuracy: null }),
        ...(outChanged && { checkOutManual: newOut !== null, checkOutOffline: false, checkOutLat: null, checkOutLng: null, checkOutDistance: null, checkOutAccuracy: null }),
      },
    });
  }
  if (changes.length && assignments[0]) {
    await auditAdmin(by, "Horas", "Corrección", `${assignments[0].event.name} (${formatDate(assignments[0].event.date)}) · ${changes.join(" | ")}`, { entityId: eventId });
  }
  revalidatePath(`/admin/eventos/${eventId}`);
}

// ---------- Tarifas ----------

/** €/hora por tipo de evento leídos de un formulario (campos «prefijo + BODA»…); null si no hay ninguno. */
function rateMap(form: FormData, prefix: string, roles: readonly string[] = []) {
  const out: Record<string, number> = {};
  for (const k of [...EVENT_TYPES, ...roles.flatMap((r) => EVENT_TYPES.map((t) => `${r}:${t}`))]) {
    const raw = String(form.get(`${prefix}${k}`) ?? "").trim();
    const v = Number(raw.replace(",", "."));
    if (raw && Number.isFinite(v) && v > 0) out[k] = Math.round(v * 1000) / 1000;
  }
  return Object.keys(out).length ? out : null;
}

export async function saveRates(form: FormData) {
  const by = await requireAdmin();
  const old = new Map((await db.rate.findMany()).map((r) => [r.role, r]));
  const rateChanges: string[] = [];
  for (const role of ROLES) {
    const hourlyRate = Number(String(form.get(`rate_${role}`) ?? "0").replace(",", "."));
    const minHours = Number(String(form.get(`min_${role}`) ?? "0").replace(",", "."));
    const eventBonus = Number(String(form.get(`bonus_${role}`) ?? "0").replace(",", ".") || 0);
    if (![hourlyRate, minHours, eventBonus].every((n) => Number.isFinite(n) && n >= 0)) continue;
    const typeRates = rateMap(form, `type_${role}_`);
    const o = old.get(role);
    const fmt = (t: unknown) => Object.entries((t ?? {}) as Record<string, number>).map(([k, v]) => `${EVENT_TYPE_LABEL[k] ?? k} ${v} €/h`).join(", ") || "—";
    if (!o || o.hourlyRate !== hourlyRate || o.minHours !== minHours || o.eventBonus !== eventBonus || fmt(o.typeRates) !== fmt(typeRates)) {
      rateChanges.push(`${ROLE_LABEL[role]}: ${o?.hourlyRate ?? "—"} €/h (${fmt(o?.typeRates)}), mín. ${o?.minHours ?? "—"} h, plus ${o?.eventBonus ?? 0} € → ${hourlyRate} €/h (${fmt(typeRates)}), mín. ${minHours} h, plus ${eventBonus} €`);
    }
    const data = { hourlyRate, minHours, eventBonus, typeRates: typeRates ?? Prisma.DbNull };
    await db.rate.upsert({ where: { role }, create: { role, ...data }, update: data });
  }
  if (rateChanges.length) await auditAdmin(by, "Ajustes", "Tarifas", rateChanges.join("; "));
  revalidatePath("/admin", "layout");
}
