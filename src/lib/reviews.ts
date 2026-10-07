import { madridTime } from "./clockRules";
import { db } from "./db";
import { addDays, isLeadRole, LEAD_ROLES, today } from "./domain";

/** Días que tiene el maître, desde el día del evento, para valorar a su equipo. */
export const REVIEW_DAYS = 7;

/** Se puede valorar desde la hora de servicio hasta REVIEW_DAYS días después del evento. */
export function reviewWindowOpen(event: { date: string; startTime: string }, now = new Date()) {
  return now >= madridTime(event.date, event.startTime) && today() <= addDays(event.date, REVIEW_DAYS);
}

type Member = { workerId: string; role: string; groupId: string | null };

/**
 * El equipo de un maître o camarero responsable (para valorarlo y verlo en directo). Sin grupos, todo el
 * personal que no dirige el evento. Con grupos, los de su grupo; quien no tiene grupo propio con responsable
 * (los mozos, por ejemplo) lo lleva quien dirige sin grupo o, si no hay, el responsable del primer grupo.
 */
export function teamOf<T extends Member>(all: T[], leadWorkerId: string): T[] {
  const crew = all.filter((a) => !isLeadRole(a.role));
  const lead = all.find((a) => a.workerId === leadWorkerId && isLeadRole(a.role));
  if (!lead || !all.some((a) => a.groupId)) return crew;
  const leads = all.filter((a) => isLeadRole(a.role));
  const led = new Set(leads.map((l) => l.groupId).filter(Boolean));
  const fallback = leads.find((l) => !l.groupId) ?? leads.filter((l) => l.groupId).sort((x, y) => (x.groupId! < y.groupId! ? -1 : 1))[0];
  return crew.filter((a) => (a.groupId && led.has(a.groupId) ? a.groupId === lead.groupId : fallback?.workerId === leadWorkerId));
}

/** A quién valora este maître o camarero responsable confirmado. */
export async function reviewTeam(eventId: string, leadWorkerId: string) {
  const all = await db.assignment.findMany({
    where: { eventId, status: "CONFIRMADO" },
    include: { worker: { select: { id: true, name: true, role: true } } },
    orderBy: [{ role: "asc" }, { worker: { name: "asc" } }],
  });
  return teamOf(all, leadWorkerId);
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
      assignments: { where: { status: "CONFIRMADO" }, select: { workerId: true, role: true, groupId: true } },
      reviews: { where: { reviewerId: leadId }, select: { workerId: true } },
    },
    orderBy: { date: "asc" },
  });
  return events
    .filter((e) => reviewWindowOpen(e))
    .map((e) => {
      const done = new Set(e.reviews.map((r) => r.workerId));
      const team = teamOf(e.assignments, leadId);
      const missing = team.filter((a) => !done.has(a.workerId)).length;
      return { id: e.id, name: e.name, date: e.date, missing, total: team.length, overdue: e.date < t };
    })
    .filter((e) => e.missing > 0);
}
