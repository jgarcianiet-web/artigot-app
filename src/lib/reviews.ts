import { madridTime } from "./clockRules";
import { db } from "./db";
import { addDays, LEAD_ROLES, today } from "./domain";

/** Días que tiene el maître, desde el día del evento, para valorar a su equipo. */
export const REVIEW_DAYS = 7;

/** Se puede valorar desde la hora de servicio hasta REVIEW_DAYS días después del evento. */
export function reviewWindowOpen(event: { date: string; startTime: string }, now = new Date()) {
  return now >= madridTime(event.date, event.startTime) && today() <= addDays(event.date, REVIEW_DAYS);
}

/** El maître o camarero responsable confirmado valora a todo el personal confirmado que no dirige el evento. */
export async function reviewTeam(eventId: string) {
  return db.assignment.findMany({
    where: { eventId, status: "CONFIRMADO", role: { notIn: [...LEAD_ROLES] } },
    include: { worker: { select: { id: true, name: true, role: true } } },
    orderBy: [{ role: "asc" }, { worker: { name: "asc" } }],
  });
}

/** ¿Dirige este trabajador el evento (maître o camarero responsable confirmado)? */
export async function isEventLead(eventId: string, workerId: string) {
  const a = await db.assignment.findUnique({
    where: { eventId_workerId: { eventId, workerId } },
    select: { role: true, status: true },
  });
  return !!a && LEAD_ROLES.includes(a.role) && a.status === "CONFIRMADO";
}

/**
 * Eventos en los que este maître o camarero responsable tiene valoraciones pendientes: los que ya han empezado
 * (dentro de los últimos REVIEW_DAYS días) y en los que falta valorar a alguien.
 * `overdue` = del día anterior o antes (bloquea aceptar nuevas convocatorias).
 */
export async function pendingReviews(leadId: string) {
  const t = today();
  const events = await db.event.findMany({
    where: {
      date: { gte: addDays(t, -REVIEW_DAYS), lte: t },
      assignments: { some: { workerId: leadId, role: { in: [...LEAD_ROLES] }, status: "CONFIRMADO" } },
    },
    include: {
      assignments: { where: { status: "CONFIRMADO", role: { notIn: [...LEAD_ROLES] } }, select: { workerId: true } },
      reviews: { where: { reviewerId: leadId }, select: { workerId: true } },
    },
    orderBy: { date: "asc" },
  });
  return events
    .filter((e) => reviewWindowOpen(e))
    .map((e) => {
      const done = new Set(e.reviews.map((r) => r.workerId));
      const missing = e.assignments.filter((a) => !done.has(a.workerId)).length;
      return { id: e.id, name: e.name, date: e.date, missing, total: e.assignments.length, overdue: e.date < t };
    })
    .filter((e) => e.missing > 0);
}
