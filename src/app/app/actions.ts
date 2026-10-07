"use server";

import { revalidatePath } from "next/cache";
import { testPush } from "@/lib/push";
import { uploadPhoto } from "@/lib/photo";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { destroySession, phoneKey, requireWorker, workerLogin } from "@/lib/auth";
import { db } from "@/lib/db";
import { forgetDevice } from "@/lib/devices";
import { checkClock, clockWindow, hhmm } from "@/lib/clockRules";
import { createIncident, type IncidentResult } from "@/lib/incidents";
import { addDocument } from "@/lib/documents";
import { storeSignature } from "@/lib/files";
import { ensurePrivacyDoc, privacySignature } from "@/lib/privacy";
import { checkIdentityDocs, storeIdentityDocs } from "@/lib/identityDocs";
import { eventTransport, isTransport, MAX_SEATS } from "@/lib/transport";
import { answerPoll } from "@/lib/polls";
import { DOC_LABEL, validDniNie, validIban } from "@/lib/staff";
import { clocksIn, formatDate, isLeadRole, isRole, nowTime, type Role, today } from "@/lib/domain";
import { autoReplace } from "@/lib/staffing";
import { placeInGroup } from "@/lib/groups";
import { sameDayBooking } from "@/lib/convocation";
import { notify } from "@/lib/push";
import { isEventLead, pendingReviews, reviewTeam, reviewWindowOpen } from "@/lib/reviews";
import { CRITERIA } from "@/lib/scoring";
import { audit, diff } from "@/lib/audit";
import { deleteStoredFile } from "@/lib/files";

export async function login(_prev: string | null, form: FormData) {
  const error = await workerLogin(String(form.get("phone") ?? ""), String(form.get("code") ?? ""));
  if (error) return error;
  redirect("/app");
}

export async function logout() {
  await forgetDevice();
  await destroySession();
  redirect("/entrar");
}

async function ownAssignment(assignmentId: string) {
  const worker = await requireWorker();
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, include: { event: true, group: true, worker: { select: { contractCode: true, noClock: true } } } });
  if (!a || a.workerId !== worker.id) throw new Error("No autorizado");
  return { a, worker };
}

export async function respond(assignmentId: string, accept: boolean) {
  const { a, worker } = await ownAssignment(assignmentId);
  if (a.event.date < today() || a.checkIn) return;
  // Solo se acepta una convocatoria pendiente; solo se rechaza una pendiente o confirmada.
  // (Una petición antigua, p. ej. tras caducar o después de un rechazo, no cambia nada.)
  const from = accept ? ["CONVOCADO"] : ["CONVOCADO", "CONFIRMADO"];
  if (!from.includes(a.status)) return;
  // Un maître o camarero responsable con valoraciones atrasadas no puede aceptar nuevas convocatorias hasta completarlas
  if (accept && (await pendingReviews(worker.id)).some((p) => p.overdue)) return;
  const status = accept ? "CONFIRMADO" : "RECHAZADO";
  const changed = await db.$transaction(async (tx) => {
    // Una respuesta a la vez por trabajador: dos aceptaciones simultáneas no pueden confirmarle en dos eventos del mismo día
    await tx.$executeRaw`SELECT id FROM "Worker" WHERE id = ${worker.id} FOR UPDATE`;
    if (accept && (await sameDayBooking(tx, a))) return false;
    const r = await tx.assignment.updateMany({
      where: { id: a.id, status: { in: from } },
      data: {
        status,
        respondedAt: new Date(),
        // Retirarse después de haber confirmado resta puntos de fiabilidad
        ...(a.status === "CONFIRMADO" && !accept && { withdrew: true }),
        // Quien no va deja su sitio en el grupo
        ...(!accept && { groupId: null }),
      },
    });
    return r.count > 0;
  });
  if (!changed) {
    revalidatePath("/app", "layout");
    return;
  }
  // En los eventos con grupos, quien acepta entra en el grupo que más lo necesita
  if (accept) await placeInGroup(a.id);
  // Quien no va se sustituye automáticamente por el siguiente mejor puntuado del mismo puesto
  if (!accept && isRole(a.role)) after(() => autoReplace(a.eventId, a.role as Role, worker.name));
  after(() =>
    notify({
      admins: true,
      adminUrl: `/admin/eventos/${a.eventId}`,
      title: accept ? "✅ Convocatoria aceptada" : "❌ Convocatoria rechazada",
      body: `${worker.name} ${accept ? "confirma" : a.status === "CONFIRMADO" ? "ya no puede ir a" : "no puede ir a"} ${a.event.name} (${formatDate(a.event.date)})`,
      tag: `resp-${a.id}`,
    }),
  );
  revalidatePath("/app", "layout");
}

export type ClockResult = { ok: boolean; message: string };

/**
 * Fichaje con geolocalización. El servidor comprueba con su propia hora que se está dentro
 * de la ventana (30 min antes de la citación → 30 min después del fin) y a menos de 200 m.
 */
export async function clock(
  assignmentId: string,
  kind: "in" | "out",
  position: { lat: number; lng: number; accuracy: number },
): Promise<ClockResult> {
  const { a } = await ownAssignment(assignmentId);
  if (!clocksIn(a.worker)) return { ok: false, message: "No necesitas fichar: tus horas van en tu nómina." };
  if (a.status !== "CONFIRMADO") return { ok: false, message: "Solo puede fichar el personal confirmado." };
  if (kind === "in" && a.checkIn) return { ok: false, message: `Ya fichaste la entrada a las ${a.checkIn}.` };
  if (kind === "out" && !a.checkIn) return { ok: false, message: "Primero tienes que fichar la entrada." };
  if (kind === "out" && a.checkOut) return { ok: false, message: `Ya fichaste la salida a las ${a.checkOut}.` };

  const pos = { lat: Number(position?.lat), lng: Number(position?.lng), accuracy: Number(position?.accuracy) };
  const check = checkClock({ event: a.event, role: a.role, group: a.group, position: pos });
  if (!check.ok) return { ok: false, message: check.reason };

  const time = nowTime();
  const accuracy = Math.round(pos.accuracy);
  await db.assignment.update({
    where: { id: a.id },
    data:
      kind === "in"
        ? { checkIn: time, checkInLat: pos.lat, checkInLng: pos.lng, checkInDistance: check.distance, checkInAccuracy: accuracy, checkInManual: false }
        : { checkOut: time, checkOutLat: pos.lat, checkOutLng: pos.lng, checkOutDistance: check.distance, checkOutAccuracy: accuracy, checkOutManual: false },
  });
  revalidatePath("/app", "layout");
  revalidatePath(`/admin/eventos/${a.eventId}`);
  // Al terminar, se recuerda al maître que valore a su equipo
  if (kind === "out" && isLeadRole(a.role)) {
    after(() =>
      notify({
        workerIds: [a.workerId],
        workerUrl: `/app/eventos/${a.eventId}/valorar`,
        title: "Valora a tu equipo",
        body: `Puntúa al personal de ${a.event.name}. Solo te llevará un minuto.`,
        tag: `rev-${a.eventId}`,
      }),
    );
  }
  return {
    ok: true,
    message: `${kind === "in" ? "Entrada" : "Salida"} registrada a las ${time} (a ${check.distance} m del evento).`,
  };
}

/**
 * Fichaje hecho sin cobertura: el móvil guardó la hora y la ubicación y lo envía al recuperar la señal.
 * La hora se corrige con el desfase del reloj del móvil (capturedAt y sentAt son de su reloj, y se
 * compara sentAt con la hora del servidor), y se aplican las mismas reglas en ese momento.
 * Es idempotente: si ya estaba registrado, se da por bueno.
 */
export async function clockOffline(
  assignmentId: string,
  kind: "in" | "out",
  position: { lat: number; lng: number; accuracy: number },
  capturedAt: number,
  sentAt: number,
): Promise<ClockResult & { done: boolean }> {
  const worker = await requireWorker();
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, include: { event: true, group: true } });
  // Fichaje guardado en este móvil por otra persona (o de una convocatoria borrada): se descarta
  if (!a || a.workerId !== worker.id) return { ok: false, done: true, message: "Se ha descartado un fichaje guardado en este móvil que no es tuyo." };
  const label = kind === "in" ? "entrada" : "salida";
  if (a.status !== "CONFIRMADO") return { ok: false, done: true, message: "Tu fichaje sin cobertura no se ha podido registrar: ya no estás confirmado en este evento." };
  if (kind === "in" && a.checkIn) return { ok: true, done: true, message: `Entrada ya registrada a las ${a.checkIn}.` };
  if (kind === "out" && a.checkOut) return { ok: true, done: true, message: `Salida ya registrada a las ${a.checkOut}.` };
  if (kind === "out" && !a.checkIn) return { ok: false, done: false, message: "La salida se enviará cuando se registre la entrada." };

  const skew = Date.now() - Number(sentAt);
  const at = new Date(Number(capturedAt) + (Number.isFinite(skew) ? skew : 0));
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 60_000) {
    return { ok: false, done: true, message: `La hora de tu fichaje de ${label} no es válida. Avisa a RRHH.` };
  }
  if (Date.now() - at.getTime() > 48 * 3_600_000) {
    return { ok: false, done: true, message: `Tu fichaje de ${label} sin cobertura tiene más de 48 horas y ya no se puede registrar. Avisa a RRHH.` };
  }
  const pos = { lat: Number(position?.lat), lng: Number(position?.lng), accuracy: Number(position?.accuracy) };
  const check = checkClock({ event: a.event, role: a.role, group: a.group, position: pos, now: at });
  if (!check.ok) {
    // RRHH lo revisa: el trabajador estuvo pero el fichaje no cumple las reglas (lejos, fuera de hora…)
    after(() =>
      notify({
        admins: true,
        adminUrl: `/admin/eventos/${a.eventId}`,
        title: "⚠ Fichaje sin cobertura rechazado",
        body: `${worker.name} · ${label} de las ${hhmm(at)} en ${a.event.name}: ${check.reason} Revisa sus horas.`,
        tag: `offline-${a.id}-${kind}`,
      }),
    );
    return { ok: false, done: true, message: `Tu fichaje de ${label} sin cobertura no se ha registrado: ${check.reason} RRHH ya está avisado para revisarlo.` };
  }
  const time = hhmm(at);
  const accuracy = Math.round(pos.accuracy);
  await db.assignment.update({
    where: { id: a.id },
    data:
      kind === "in"
        ? { checkIn: time, checkInLat: pos.lat, checkInLng: pos.lng, checkInDistance: check.distance, checkInAccuracy: accuracy, checkInManual: false, checkInOffline: true }
        : { checkOut: time, checkOutLat: pos.lat, checkOutLng: pos.lng, checkOutDistance: check.distance, checkOutAccuracy: accuracy, checkOutManual: false, checkOutOffline: true },
  });
  await audit(worker.name, "Trabajador", "Horas", "Fichaje sin cobertura", `${worker.name}: ${label} ${time} en ${a.event.name}, enviada al recuperar la cobertura (desfase del reloj del móvil: ${Math.round(skew / 1000)} s)`, { entityId: a.eventId });
  revalidatePath("/app", "layout");
  revalidatePath(`/admin/eventos/${a.eventId}`);
  return { ok: true, done: true, message: `${kind === "in" ? "Entrada" : "Salida"} de las ${time} registrada (fichada sin cobertura).` };
}

export async function toggleUnavailable(date: string) {
  const worker = await requireWorker();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) return;
  const existing = await db.unavailability.findUnique({ where: { workerId_date: { workerId: worker.id, date } } });
  if (existing) await db.unavailability.delete({ where: { id: existing.id } });
  else await db.unavailability.create({ data: { workerId: worker.id, date } });
  revalidatePath("/app");
}

// ---------- Valoraciones del maître / camarero responsable ----------

export type ReviewResult = { ok: boolean; message: string };

const score = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

/** Guarda las valoraciones del maître o camarero responsable para su equipo (solo filas completas). */
export async function saveReviews(eventId: string, _prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const me = await requireWorker();
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event || !(await isEventLead(eventId, me.id))) return { ok: false, message: "Solo el maître o el camarero responsable del evento puede valorar." };
  if (!reviewWindowOpen(event)) return { ok: false, message: "El plazo para valorar este evento no está abierto." };

  const team = await reviewTeam(eventId, me.id);
  let saved = 0;
  const incomplete: string[] = [];
  for (const a of team) {
    const noShow = form.get(`noShow_${a.workerId}`) === "1";
    const values = Object.fromEntries(CRITERIA.map((c) => [c.key, score(form.get(`${c.key}_${a.workerId}`))]));
    const comment = String(form.get(`comment_${a.workerId}`) ?? "").trim().slice(0, 500) || null;
    const complete = CRITERIA.every((c) => values[c.key] != null);
    const touched = noShow || comment || CRITERIA.some((c) => values[c.key] != null);
    if (!touched) continue;
    if (!noShow && !complete) {
      incomplete.push(a.worker.name);
      continue;
    }
    const data = noShow
      ? { noShow: true, punctuality: null, appearance: null, service: null, attitude: null, comment }
      : { noShow: false, ...values, comment };
    await db.review.upsert({
      where: { eventId_workerId_reviewerId: { eventId, workerId: a.workerId, reviewerId: me.id } },
      create: { eventId, workerId: a.workerId, reviewerId: me.id, ...data },
      update: data,
    });
    saved++;
  }
  revalidatePath("/app", "layout");
  revalidatePath(`/admin/eventos/${eventId}`);
  if (incomplete.length) {
    return { ok: false, message: `Guardadas ${saved}. Faltan puntuaciones de: ${incomplete.join(", ")}.` };
  }
  return { ok: true, message: saved ? `¡Gracias! ${saved} valoraciones guardadas.` : "No has puntuado a nadie todavía." };
}

// ---------- Día del evento (maître / camarero responsable) ----------

/** El responsable marca la llegada de alguien de su equipo (p. ej. sin batería). Queda como fichaje manual. */
export async function markArrival(assignmentId: string) {
  const me = await requireWorker();
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, include: { event: true, group: true } });
  if (!a || a.status !== "CONFIRMADO" || a.checkIn || !(await isEventLead(a.eventId, me.id))) return;
  const w = clockWindow(a.event, a.role, a.group);
  const now = new Date();
  if (now < w.opensAt || now > w.closesAt) return;
  await db.assignment.update({
    where: { id: a.id },
    data: { checkIn: nowTime(), checkInManual: true, notes: `Llegada marcada por ${me.name}` },
  });
  const who = await db.worker.findUnique({ where: { id: a.workerId }, select: { name: true } });
  await audit(me.name, "Trabajador", "Horas", "Llegada marcada", `${me.name} marca la llegada de ${who?.name ?? "?"} en ${a.event.name}`, { entityId: a.eventId });
  revalidatePath(`/app/eventos/${a.eventId}/equipo`);
  revalidatePath(`/admin/eventos/${a.eventId}`);
}

export async function reportIncident(eventId: string, _prev: IncidentResult | null, form: FormData): Promise<IncidentResult> {
  const me = await requireWorker();
  if (!(await isEventLead(eventId, me.id))) return { ok: false, message: "Solo el maître o el camarero responsable pueden registrar incidencias." };
  const r = await createIncident({ kind: "worker", id: me.id, name: me.name, role: me.role }, eventId, form);
  revalidatePath(`/app/eventos/${eventId}/equipo`);
  return r;
}

// ---------- Mis datos y documentos ----------

export type FormResult = { ok: boolean; message: string } | null;

export async function saveMyData(_prev: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireWorker();
  const dni = String(form.get("dni") ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  const iban = String(form.get("iban") ?? "").trim().toUpperCase().replace(/\s/g, "");
  const nss = String(form.get("nss") ?? "").replace(/\D/g, "");
  const birthDate = String(form.get("birthDate") ?? "");
  const address = String(form.get("address") ?? "").trim().slice(0, 200);
  const email = String(form.get("email") ?? "").trim();
  const newPhone = String(form.get("phone") ?? "").trim();
  const sex = String(form.get("sex") ?? "");
  const nationality = String(form.get("nationality") ?? "").trim().toLocaleUpperCase("es-ES").slice(0, 60);
  if (!(await privacySignature(me.id))) return { ok: false, message: "Antes de completar tus datos tienes que firmar la cláusula de protección de datos." };
  if (!dni) return { ok: false, message: "Escribe tu DNI / NIE." };
  if (!nss) return { ok: false, message: "Escribe tu número de la Seguridad Social." };
  if (!iban) return { ok: false, message: "Escribe tu IBAN." };
  if (!validDniNie(dni)) return { ok: false, message: "El DNI/NIE no es correcto (revisa la letra)." };
  if (!validIban(iban)) return { ok: false, message: "El IBAN no es correcto." };
  if (nss.length !== 12) return { ok: false, message: "El número de la Seguridad Social tiene 12 cifras." };
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { ok: false, message: "Fecha de nacimiento no válida." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Email no válido." };
  const before = await db.worker.findUniqueOrThrow({ where: { id: me.id } });
  // Quien entró con su email puede añadir su móvil (una sola vez; después lo cambia RRHH)
  let phoneData = {};
  if (!before.phone && newPhone) {
    const key = phoneKey(newPhone);
    if (key.length < 9) return { ok: false, message: "El teléfono no es válido." };
    if (await db.worker.findUnique({ where: { phoneKey: key } })) return { ok: false, message: "Ese teléfono ya lo tiene otra persona. Habla con RRHH." };
    phoneData = { phone: newPhone, phoneKey: key };
  }
  const docError = await checkIdentityDocs(me.id, before, { dni, nss, iban }, form);
  if (docError) return { ok: false, message: docError };
  const after_ = await db.worker.update({
    where: { id: me.id },
    data: { dni: dni || null, iban: iban || null, nss: nss || null, birthDate: birthDate || null, address: address || null, email: email || null,
      ...(form.has("sex") && { sex: sex === "Hombre" || sex === "Mujer" ? sex : null }),
      ...(form.has("nationality") && { nationality: nationality || null }),
      ...phoneData,
    },
  });
  const d = diff(before, after_, { dni: "DNI", nss: "NSS", iban: "IBAN", birthDate: "Nacimiento", address: "Dirección", email: "Email", sex: "Sexo", nationality: "Nacionalidad", phone: "Teléfono" });
  if (d.changed) await audit(me.name, "Trabajador", "Trabajador", "Datos (desde la app)", `${me.name}: ${d.text}`, { entityId: me.id, data: d.data });
  let stored: string[];
  try {
    stored = await storeIdentityDocs(me.id, form, me.name, false);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  if (stored.length) {
    const what = stored.map((t) => DOC_LABEL[t] ?? t).join(", ");
    await audit(me.name, "Trabajador", "Documento", "Subido (desde la app)", `${me.name}: ${what}`, { entityId: me.id });
    after(() =>
      notify({ admins: true, adminUrl: `/admin/personal/${me.id}`, title: "Documentos nuevos", body: `${me.name} ha subido: ${what}. Revísalos en su ficha.`, tag: `doc-${me.id}` }),
    );
  }
  revalidatePath("/app/perfil");
  return { ok: true, message: stored.length ? "Datos y documentos guardados. RRHH los revisará." : "Datos guardados." };
}

export async function uploadMyDocument(_prev: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireWorker();
  if (!(await privacySignature(me.id))) {
    return { ok: false, message: "Antes de subir documentos tienes que firmar la cláusula de protección de datos." };
  }
  const r = await addDocument(me.id, form, me.name);
  if (r.ok) {
    after(() =>
      notify({
        admins: true,
        adminUrl: `/admin/personal/${me.id}`,
        title: "Documento nuevo",
        body: `${me.name} ha subido: ${DOC_LABEL[String(form.get("type"))] ?? "documento"}. Revísalo en su ficha.`,
        tag: `doc-${me.id}`,
      }),
    );
  }
  revalidatePath("/app/perfil");
  return r;
}

export async function deleteMyDocument(id: string) {
  const me = await requireWorker();
  const d = await db.workerDocument.findUnique({ where: { id } });
  if (!d || d.workerId !== me.id || d.verified) return; // los revisados por RRHH solo los borra RRHH
  await db.workerDocument.delete({ where: { id } });
  if (d.fileId) await deleteStoredFile(d.fileId);
  revalidatePath("/app/perfil");
}

// ---------- Foto de perfil ----------

export async function uploadMyPhoto(_prev: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireWorker();
  const file = form.get("photo");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Elige o haz una foto." };
  try {
    await uploadPhoto(me.id, file, { name: me.name, admin: false });
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  revalidatePath("/app", "layout");
  revalidatePath("/admin/documentos");
  return { ok: true, message: "Foto enviada. RRHH la revisará y te avisaremos si hay que cambiarla." };
}

// ---------- Firma de documentos ----------

export async function signContract(contractId: string, _prev: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireWorker();
  const c = await db.contract.findUnique({ where: { id: contractId } });
  if (!c || c.workerId !== me.id) return { ok: false, message: "No autorizado" };
  if (c.signedAt) return { ok: true, message: "Ya estaba firmado." };
  if (form.get("accept") !== "1") return { ok: false, message: "Marca la casilla de conformidad." };
  const dataUrl = String(form.get("signature") ?? "");
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { ok: false, message: "Firma en el recuadro antes de continuar." };
  const png = Buffer.from(m[1], "base64");
  if (png.length < 500) return { ok: false, message: "La firma es demasiado corta. Firma de nuevo." };
  const sig = await storeSignature(png, me.id);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  await db.contract.update({ where: { id: c.id }, data: { signedAt: new Date(), signerName: me.name, signerIp: ip, signatureFileId: sig.id, signerNote: note } });
  await audit(me.name, "Trabajador", "Documento", "Firmado", `${me.name} firma «${c.title}»${note ? ` con observaciones: ${note}` : ""}`, { entityId: me.id });
  if (note) {
    after(() =>
      notify({
        admins: true,
        adminUrl: c.kind === "JORNADA" ? "/admin/jornada" : `/admin/personal/${me.id}`,
        title: "Observaciones al firmar",
        body: `${me.name} ha firmado «${c.title}» con observaciones: ${note.slice(0, 120)}`,
        tag: `nota-${c.id}`,
      }),
    );
  }
  revalidatePath("/app", "layout");
  if (c.eventId) revalidatePath(`/admin/eventos/${c.eventId}`);
  revalidatePath(`/admin/personal/${me.id}`);
  return { ok: true, message: "¡Firmado! Puedes descargar tu copia en PDF." };
}

/** Abre la cláusula de protección de datos para firmarla. */
export async function startPrivacySignature() {
  const me = await requireWorker();
  if (await privacySignature(me.id)) redirect("/app/perfil");
  const doc = await ensurePrivacyDoc(me.id);
  redirect(`/app/firmar/${doc.id}`);
}

// ---------- Transporte ----------

/** Cómo va al evento: por su cuenta, con su coche (y plazas libres) o necesita que le lleven. */
export async function setMyTransport(assignmentId: string, form: FormData) {
  const { a, worker } = await ownAssignment(assignmentId);
  if (a.status !== "CONFIRMADO" || a.event.date < today()) return;
  const mode = String(form.get("transport") ?? "");
  if (!isTransport(mode)) return;
  const seats = mode === "CONDUZCO" ? Math.max(0, Math.min(MAX_SEATS, Math.round(Number(form.get("seats")) || 0))) : null;
  // Si deja de llevar coche (o tiene menos plazas), sus pasajeros se quedan sin coche y se les avisa
  const passengers = await db.assignment.findMany({ where: { rideWithId: a.id }, select: { id: true, workerId: true }, orderBy: { createdAt: "asc" } });
  const dropped = mode === "CONDUZCO" ? passengers.slice(seats ?? 0) : passengers;
  await db.$transaction([
    db.assignment.update({ where: { id: a.id }, data: { transport: mode, seats, ...(mode !== "NECESITO" && { rideWithId: null }) } }),
    db.assignment.updateMany({ where: { id: { in: dropped.map((p) => p.id) } }, data: { rideWithId: null } }),
    ...(mode === "CONDUZCO" ? [db.worker.update({ where: { id: worker.id }, data: { carSeats: seats } })] : []),
  ]);
  if (dropped.length) {
    after(() =>
      notify({
        workerIds: dropped.map((p) => p.workerId),
        workerUrl: `/app/eventos/${a.eventId}`,
        title: "Te has quedado sin coche",
        body: `${worker.name} ya no puede llevarte a ${a.event.name}. Busca otro coche en la app o avisa a RRHH.`,
        tag: `coche-${a.eventId}`,
      }),
    );
  }
  revalidatePath(`/app/eventos/${a.eventId}`);
  revalidatePath(`/admin/eventos/${a.eventId}`);
}

/** Se apunta al coche de un compañero con plazas libres. */
export async function joinRide(assignmentId: string, driverAssignmentId: string) {
  const { a, worker } = await ownAssignment(assignmentId);
  if (a.status !== "CONFIRMADO" || a.event.date < today()) return;
  const t = await eventTransport(a.eventId);
  const car = t.cars.find((c) => c.driver.id === driverAssignmentId);
  if (!car || car.driver.id === a.id || (car.free <= 0 && !car.passengers.some((p) => p.id === a.id))) return;
  await db.assignment.update({ where: { id: a.id }, data: { transport: "NECESITO", seats: null, rideWithId: car.driver.id } });
  const phone = (await db.worker.findUnique({ where: { id: worker.id }, select: { phone: true } }))?.phone ?? "";
  after(() =>
    notify({
      workerIds: [car.driver.workerId],
      workerUrl: `/app/eventos/${a.eventId}`,
      title: "Nuevo pasajero",
      body: `${worker.name} irá en tu coche a ${a.event.name}. Tel. ${phone}`,
      tag: `coche-${a.eventId}`,
    }),
  );
  revalidatePath(`/app/eventos/${a.eventId}`);
  revalidatePath(`/admin/eventos/${a.eventId}`);
}

export async function leaveRide(assignmentId: string) {
  const { a, worker } = await ownAssignment(assignmentId);
  if (!a.rideWithId) return;
  const driver = await db.assignment.findUnique({ where: { id: a.rideWithId }, select: { workerId: true } });
  await db.assignment.update({ where: { id: a.id }, data: { rideWithId: null } });
  if (driver) {
    after(() =>
      notify({ workerIds: [driver.workerId], workerUrl: `/app/eventos/${a.eventId}`, title: "Un pasajero menos", body: `${worker.name} ya no irá en tu coche a ${a.event.name}.`, tag: `coche-${a.eventId}` }),
    );
  }
  revalidatePath(`/app/eventos/${a.eventId}`);
  revalidatePath(`/admin/eventos/${a.eventId}`);
}

// ---------- Sondeos de disponibilidad ----------

export async function answerPollAction(pollId: string, date: string, available: boolean) {
  const me = await requireWorker();
  if (await answerPoll(me.id, pollId, date, available)) {
    revalidatePath("/app");
    revalidatePath(`/admin/sondeos/${pollId}`);
  }
}

export async function testMyPush() {
  const me = await requireWorker();
  return testPush({ workerId: me.id });
}
