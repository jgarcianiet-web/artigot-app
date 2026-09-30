"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { destroySession, requireWorker, workerLogin } from "@/lib/auth";
import { db } from "@/lib/db";
import { forgetDevice } from "@/lib/devices";
import { checkClock, clockWindow } from "@/lib/clockRules";
import { createIncident, type IncidentResult } from "@/lib/incidents";
import { formatDate, isLeadRole, isRole, nowTime, type Role, today } from "@/lib/domain";
import { autoReplace } from "@/lib/staffing";
import { notify } from "@/lib/push";
import { isEventLead, pendingReviews, reviewTeam, reviewWindowOpen } from "@/lib/reviews";
import { CRITERIA } from "@/lib/scoring";

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
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, include: { event: true } });
  if (!a || a.workerId !== worker.id) throw new Error("No autorizado");
  return { a, worker };
}

export async function respond(assignmentId: string, accept: boolean) {
  const { a, worker } = await ownAssignment(assignmentId);
  if (a.event.date < today() || a.status === "CANCELADO" || a.checkIn) return;
  const status = accept ? "CONFIRMADO" : "RECHAZADO";
  if (a.status === status) return;
  // Un maître o camarero responsable con valoraciones atrasadas no puede aceptar nuevas convocatorias hasta completarlas
  if (accept && (await pendingReviews(worker.id)).some((p) => p.overdue)) return;
  await db.assignment.update({
    where: { id: a.id },
    // Retirarse después de haber confirmado resta puntos de fiabilidad
    data: { status, respondedAt: new Date(), ...(a.status === "CONFIRMADO" && !accept && { withdrew: true }) },
  });
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
  if (a.status !== "CONFIRMADO") return { ok: false, message: "Solo puede fichar el personal confirmado." };
  if (kind === "in" && a.checkIn) return { ok: false, message: `Ya fichaste la entrada a las ${a.checkIn}.` };
  if (kind === "out" && !a.checkIn) return { ok: false, message: "Primero tienes que fichar la entrada." };
  if (kind === "out" && a.checkOut) return { ok: false, message: `Ya fichaste la salida a las ${a.checkOut}.` };

  const pos = { lat: Number(position?.lat), lng: Number(position?.lng), accuracy: Number(position?.accuracy) };
  const check = checkClock({ event: a.event, role: a.role, position: pos });
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

  const team = await reviewTeam(eventId);
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
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, include: { event: true } });
  if (!a || a.status !== "CONFIRMADO" || a.checkIn || !(await isEventLead(a.eventId, me.id))) return;
  const w = clockWindow(a.event, a.role);
  const now = new Date();
  if (now < w.opensAt || now > w.closesAt) return;
  await db.assignment.update({
    where: { id: a.id },
    data: { checkIn: nowTime(), checkInManual: true, notes: `Llegada marcada por ${me.name}` },
  });
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
