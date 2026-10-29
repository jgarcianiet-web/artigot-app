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
import { notifyIfAllSigned } from "@/lib/signRequests";
import { type DayAnswer, isDayAnswer } from "@/lib/slots";
import { DOC_LABEL, validDniNie, validIban } from "@/lib/staff";
import { clocksIn, formatDate, isLeadRole, isRole, nowTime, type Role, today } from "@/lib/domain";
import { autoReplace } from "@/lib/staffing";
import { placeInGroup } from "@/lib/groups";
import { applyWithdrawal, canWithdrawFreely, WITHDRAW_FREE_HOURS } from "@/lib/withdrawals";
import { notify } from "@/lib/push";
import { isEventLead, pendingReviews, reviewTeam, reviewWindowOpen } from "@/lib/reviews";
import { CRITERIA } from "@/lib/scoring";
import { audit, diff } from "@/lib/audit";
import { deleteStoredFile } from "@/lib/files";
import { ageOn, MIN_AGE, minorStatus, TUTOR_RELATIONS, tutorText } from "@/lib/minors";
import { canChooseMedical } from "@/lib/prl";

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
  // Solo se acepta o rechaza una convocatoria pendiente (una petición antigua, p. ej. tras caducar, no cambia
  // nada). Quien ya confirmó y no puede ir usa «Ya no puedo ir» (withdraw), con motivo.
  const from = ["CONVOCADO"];
  if (!from.includes(a.status)) return;
  // Un maître o camarero responsable con valoraciones atrasadas no puede aceptar nuevas convocatorias hasta completarlas
  if (accept && (await pendingReviews(worker.id)).some((p) => p.overdue)) return;
  const status = accept ? "CONFIRMADO" : "RECHAZADO";
  const changed = await db.$transaction(async (tx) => {
    const r = await tx.assignment.updateMany({
      where: { id: a.id, status: { in: from } },
      data: {
        status,
        respondedAt: new Date(),
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
      body: `${worker.name} ${accept ? "confirma" : "no puede ir a"} ${a.event.name} (${formatDate(a.event.date)})`,
      tag: `resp-${a.id}`,
    }),
  );
  revalidatePath("/app", "layout");
}

export type WithdrawResult = { ok: boolean; message: string } | null;

/**
 * «Ya no puedo ir» de alguien confirmado, con motivo obligatorio. Con más de 24 h hasta su entrada se cancela
 * al momento; con menos, queda como solicitud que aprueba RRHH (mientras tanto sigue confirmado).
 */
export async function withdraw(assignmentId: string, _prev: WithdrawResult, form: FormData): Promise<WithdrawResult> {
  const { a, worker } = await ownAssignment(assignmentId);
  const reason = cleanReason(form.get("reason"));
  if (reason.length < 3) return { ok: false, message: "Escribe el motivo por el que no puedes ir (es obligatorio)." };
  if (a.status !== "CONFIRMADO" || a.checkIn || a.event.date < today()) return { ok: false, message: "Esta convocatoria ya no se puede cancelar desde la app. Habla con RRHH." };
  if (a.withdrawRequestedAt) return { ok: false, message: "Ya enviaste la solicitud: RRHH la está revisando." };
  const when = formatDate(a.event.date);
  if (canWithdrawFreely(a)) {
    await applyWithdrawal(a.id, reason, worker.name);
    await audit(worker.name, "Trabajador", "Convocatoria", "No asistencia", `${worker.name} cancela su asistencia a ${a.event.name} (${when}). Motivo: ${reason}`, { entityId: a.eventId });
    after(() =>
      notify({
        admins: true,
        adminUrl: `/admin/eventos/${a.eventId}`,
        title: "❌ Cancela su asistencia",
        body: `${worker.name} ya no irá a ${a.event.name} (${when}). Motivo: ${reason}`,
        tag: `resp-${a.id}`,
      }),
    );
    revalidatePath("/app", "layout");
    revalidatePath(`/admin/eventos/${a.eventId}`);
    return { ok: true, message: "Hecho: ya no estás en este evento. Gracias por avisar con tiempo." };
  }
  await db.assignment.update({ where: { id: a.id }, data: { withdrawRequestedAt: new Date(), withdrawReason: reason } });
  await audit(worker.name, "Trabajador", "Convocatoria", "Solicitud de no asistencia", `${worker.name} pide no ir a ${a.event.name} (${when}), a menos de ${WITHDRAW_FREE_HOURS} h. Motivo: ${reason}`, { entityId: a.eventId });
  after(() =>
    notify({
      admins: true,
      adminUrl: `/admin/eventos/${a.eventId}`,
      title: "⚠ Solicitud de no asistencia",
      body: `${worker.name} pide no ir a ${a.event.name} (${when}), a menos de ${WITHDRAW_FREE_HOURS} h. Motivo: ${reason}. Apruébala o recházala en el evento.`,
      tag: `baja-${a.id}`,
    }),
  );
  revalidatePath("/app", "layout");
  revalidatePath(`/admin/eventos/${a.eventId}`);
  return { ok: true, message: "Solicitud enviada. Como faltan menos de 24 h, RRHH tiene que aprobarla: hasta entonces sigues confirmado." };
}

export type ClockResult = { ok: boolean; message: string; /** Fuera del horario normal: hay que escribir el motivo */ needReason?: string };

const MAX_REASON = 300;
const cleanReason = (r: unknown) => String(r ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_REASON);

/** Avisa a RRHH de un fichaje fuera del horario normal, con su motivo. */
function notifyUnusual(a: { id: string; eventId: string; event: { name: string } }, who: string, kind: "in" | "out", time: string, reason: string) {
  after(() =>
    notify({
      admins: true,
      adminUrl: `/admin/eventos/${a.eventId}?tab=horas`,
      title: kind === "in" ? "⏰ Entrada antes de tiempo" : "⏰ Fichaje fuera de hora",
      body: `${who} ficha la ${kind === "in" ? "entrada" : "salida"} a las ${time} en ${a.event.name}. Motivo: ${reason}`,
      tag: `motivo-${a.id}-${kind}`,
    }),
  );
}

/**
 * Fichaje con geolocalización. El servidor comprueba con su propia hora la distancia (menos de 200 m) y si se
 * ficha fuera del horario normal (más de 30 min antes de la citación o después del fin): entonces hace falta
 * el motivo, que se guarda y se avisa a RRHH.
 */
export async function clock(
  assignmentId: string,
  kind: "in" | "out",
  position: { lat: number; lng: number; accuracy: number },
  reasonText?: string,
): Promise<ClockResult> {
  const { a, worker } = await ownAssignment(assignmentId);
  if (!clocksIn(a.worker)) return { ok: false, message: "No necesitas fichar: tus horas van en tu nómina." };
  if (a.status !== "CONFIRMADO") return { ok: false, message: "Solo puede fichar el personal confirmado." };
  if (kind === "in" && a.checkIn) return { ok: false, message: `Ya fichaste la entrada a las ${a.checkIn}.` };
  if (kind === "out" && !a.checkIn) return { ok: false, message: "Primero tienes que fichar la entrada." };
  if (kind === "out" && a.checkOut) return { ok: false, message: `Ya fichaste la salida a las ${a.checkOut}.` };

  const pos = { lat: Number(position?.lat), lng: Number(position?.lng), accuracy: Number(position?.accuracy) };
  const check = checkClock({ event: a.event, role: a.role, kind, group: a.group, position: pos });
  if (!check.ok) return { ok: false, message: check.reason };
  const reason = check.unusual ? cleanReason(reasonText) : null;
  if (check.unusual && (!reason || reason.length < 3)) return { ok: false, needReason: check.question!, message: check.question! };

  const time = nowTime();
  const accuracy = Math.round(pos.accuracy);
  await db.assignment.update({
    where: { id: a.id },
    data:
      kind === "in"
        ? { checkIn: time, checkInLat: pos.lat, checkInLng: pos.lng, checkInDistance: check.distance, checkInAccuracy: accuracy, checkInManual: false, checkInReason: reason }
        : { checkOut: time, checkOutLat: pos.lat, checkOutLng: pos.lng, checkOutDistance: check.distance, checkOutAccuracy: accuracy, checkOutManual: false, checkOutReason: reason },
  });
  if (reason) notifyUnusual(a, worker.name, kind, time, reason);
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
  reasonText?: string,
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
  const check = checkClock({ event: a.event, role: a.role, kind, group: a.group, position: pos, now: at });
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
  // El motivo se escribe en el móvil antes de guardar el fichaje; si no llegó (móvil con otra hora), queda indicado
  const reason = check.unusual ? cleanReason(reasonText) || "Sin motivo (fichado sin cobertura)" : null;
  await db.assignment.update({
    where: { id: a.id },
    data:
      kind === "in"
        ? { checkIn: time, checkInLat: pos.lat, checkInLng: pos.lng, checkInDistance: check.distance, checkInAccuracy: accuracy, checkInManual: false, checkInOffline: true, checkInReason: reason }
        : { checkOut: time, checkOutLat: pos.lat, checkOutLng: pos.lng, checkOutDistance: check.distance, checkOutAccuracy: accuracy, checkOutManual: false, checkOutOffline: true, checkOutReason: reason },
  });
  if (reason) notifyUnusual(a, worker.name, kind, time, reason);
  await audit(worker.name, "Trabajador", "Horas", "Fichaje sin cobertura", `${worker.name}: ${label} ${time} en ${a.event.name}, enviada al recuperar la cobertura (desfase del reloj del móvil: ${Math.round(skew / 1000)} s)`, { entityId: a.eventId });
  revalidatePath("/app", "layout");
  revalidatePath(`/admin/eventos/${a.eventId}`);
  return { ok: true, done: true, message: `${kind === "in" ? "Entrada" : "Salida"} de las ${time} registrada (fichada sin cobertura).` };
}

/** «Mi disponibilidad»: un día puede ser todo el día (nada guardado), solo mañana, solo tarde o no puede. */
export async function setAvailability(date: string, answer: DayAnswer) {
  const worker = await requireWorker();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today() || !isDayAnswer(answer)) return;
  if (answer === "DIA") await db.unavailability.deleteMany({ where: { workerId: worker.id, date } });
  else {
    const only = answer === "NO" ? null : answer;
    await db.unavailability.upsert({
      where: { workerId_date: { workerId: worker.id, date } },
      create: { workerId: worker.id, date, only },
      update: { only, reason: null },
    });
  }
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
  if (now < w.firstAt || now > w.lastAt) return;
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
  if (birthDate && ageOn(birthDate) < MIN_AGE) return { ok: false, message: `Para trabajar con nosotros tienes que tener al menos ${MIN_AGE} años. Revisa la fecha de nacimiento.` };
  if (!email) return { ok: false, message: "Escribe tu email." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Email no válido." };
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
  // Menor de edad: hasta tener la autorización firmada de su padre, madre o tutor no puede seguir
  if ((await minorStatus(after_))?.state === "needs-tutor") redirect("/autorizacion");
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
  // Reconocimiento médico: los fijos y los maîtres eligen; los extras y los mozos, siempre «NO DESEO»
  const choice = c.kind === "PRL_RECONOCIMIENTO" && !canChooseMedical(me) ? "NO" : String(form.get("choice") ?? "");
  if (c.kind === "PRL_RECONOCIMIENTO" && choice !== "SI" && choice !== "NO") return { ok: false, message: "Indica si deseas o no pasar el reconocimiento médico." };
  const dataUrl = String(form.get("signature") ?? "");
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { ok: false, message: "Firma en el recuadro antes de continuar." };
  const png = Buffer.from(m[1], "base64");
  if (png.length < 500) return { ok: false, message: "La firma es demasiado corta. Firma de nuevo." };
  const sig = await storeSignature(png, me.id);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  await db.contract.update({
    where: { id: c.id },
    data: {
      signedAt: new Date(), signerName: me.name, signerIp: ip, signatureFileId: sig.id, signerNote: note,
      ...(c.kind === "PRL_RECONOCIMIENTO" && { data: { ...((c.data ?? {}) as object), choice } }),
    },
  });
  await audit(me.name, "Trabajador", "Documento", "Firmado", `${me.name} firma «${c.title}»${note ? ` con observaciones: ${note}` : ""}`, { entityId: me.id });
  // Documento enviado por RRHH: cuando firma el último, se avisa a RRHH
  if (c.requestId) {
    const requestId = c.requestId;
    after(() => notifyIfAllSigned(requestId, c.title));
  }
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

/** Autorización del padre, madre o tutor de un trabajador de 16 o 17 años: la firma el tutor en el móvil del menor. */
export async function signTutorAuthorization(_prev: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireWorker();
  const status = await minorStatus(me);
  if (status?.state !== "needs-tutor") return { ok: true, message: "No hace falta autorización." };
  const name = String(form.get("tutorName") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const dni = String(form.get("tutorDni") ?? "").trim().toUpperCase().replace(/[\s.-]/g, "");
  const relation = String(form.get("relation") ?? "");
  if (name.split(" ").length < 2) return { ok: false, message: "Escribe el nombre y los apellidos del padre, madre o tutor." };
  if (!validDniNie(dni)) return { ok: false, message: "El DNI/NIE del padre, madre o tutor no es correcto (revisa la letra)." };
  if (me.dni && dni === me.dni) return { ok: false, message: "El DNI tiene que ser el del padre, madre o tutor, no el tuyo." };
  if (!(TUTOR_RELATIONS as readonly string[]).includes(relation)) return { ok: false, message: "Indica si es tu padre, tu madre o tu tutor/a legal." };
  if (form.get("accept") !== "1") return { ok: false, message: "El padre, madre o tutor tiene que marcar la casilla de autorización." };
  const m = String(form.get("signature") ?? "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { ok: false, message: "El padre, madre o tutor tiene que firmar en el recuadro." };
  const png = Buffer.from(m[1], "base64");
  if (png.length < 500) return { ok: false, message: "La firma es demasiado corta. Firma de nuevo." };
  const sig = await storeSignature(png, me.id);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  const tutor = { name, dni, relation };
  await db.contract.create({
    data: {
      kind: "TUTOR",
      workerId: me.id,
      title: "Autorización del padre, madre o tutor para trabajar",
      body: await tutorText({ name: me.name, dni: me.dni, birthDate: me.birthDate! }, tutor),
      createdBy: me.name,
      signedAt: new Date(),
      signerName: name,
      signerIp: ip,
      signatureFileId: sig.id,
      data: { tutorName: name, tutorDni: dni, relation, birthDate: me.birthDate },
    },
  });
  await audit(me.name, "Trabajador", "Documento", "Autorización del tutor", `${me.name} (${status.age} años): autoriza ${relation.toLowerCase()} ${name} (${dni})`, { entityId: me.id });
  after(() =>
    notify({ admins: true, adminUrl: `/admin/personal/${me.id}`, title: "Autorización de menor", body: `${me.name} (${status.age} años) ya tiene firmada la autorización de ${name}.`, tag: `tutor-${me.id}` }),
  );
  revalidatePath("/app", "layout");
  revalidatePath(`/admin/personal/${me.id}`);
  redirect("/app/perfil");
}

/** Corrige la fecha de nacimiento desde la pantalla de autorización (si la puso mal). */
export async function fixMyBirthDate(_prev: FormResult, form: FormData): Promise<FormResult> {
  const me = await requireWorker();
  const birthDate = String(form.get("birthDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { ok: false, message: "Fecha de nacimiento no válida." };
  if (ageOn(birthDate) < MIN_AGE) return { ok: false, message: `Para trabajar con nosotros tienes que tener al menos ${MIN_AGE} años.` };
  await db.worker.update({ where: { id: me.id }, data: { birthDate } });
  await audit(me.name, "Trabajador", "Trabajador", "Datos (desde la app)", `${me.name}: Nacimiento ${me.birthDate ?? "—"} → ${birthDate}`, { entityId: me.id });
  revalidatePath("/app", "layout");
  redirect((await minorStatus({ id: me.id, birthDate }))?.state === "needs-tutor" ? "/autorizacion" : "/app");
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

export async function answerPollAction(pollId: string, date: string, answer: DayAnswer) {
  const me = await requireWorker();
  if (isDayAnswer(answer) && (await answerPoll(me.id, pollId, date, answer))) {
    revalidatePath("/app");
    revalidatePath(`/admin/sondeos/${pollId}`);
  }
}

export async function testMyPush() {
  const me = await requireWorker();
  return testPush({ workerId: me.id });
}
