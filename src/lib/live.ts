import { madridTime } from "./clockRules";
import { db } from "./db";
import { callTime, clocksIn, isLeadRole, ROLES } from "./domain";
import { REMINDERS } from "./reminders";
import { teamOf } from "./reviews";

export type LiveState = "esperando" | "retraso" | "trabajando" | "terminado";

/** Estado en directo del equipo confirmado de un evento (para el maître y RRHH). */
export async function liveTeam(eventId: string, now = new Date(), leadWorkerId?: string) {
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      assignments: {
        where: { status: "CONFIRMADO" },
        include: { worker: { select: { id: true, name: true, phone: true, contractCode: true, noClock: true } }, group: { select: { id: true, name: true, callTime: true } } },
        orderBy: { worker: { name: "asc" } },
      },
    },
  });
  let rows = event.assignments.map((a) => {
    const call = callTime(event, a.role, a.group);
    const lateFrom = madridTime(event.date, call).getTime() + REMINDERS.LATE_AFTER_MIN * 60_000;
    const state: LiveState = a.checkOut
      ? "terminado"
      : a.checkIn
        ? "trabajando"
        : now.getTime() > lateFrom
          ? clocksIn(a.worker)
            ? "retraso"
            : "trabajando" // quien no ficha no va con retraso
          : "esperando";
    return {
      id: a.id,
      workerId: a.workerId,
      name: a.worker.name,
      phone: a.worker.phone,
      role: a.role,
      lead: isLeadRole(a.role),
      call,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      distance: a.checkInDistance,
      manual: a.checkInManual,
      groupId: a.groupId,
      group: a.group?.name ?? null,
      state,
    };
  });
  // El maître o responsable de un grupo ve a su grupo (y a quienes dirigen el evento)
  if (leadWorkerId) {
    const team = new Set(teamOf(rows, leadWorkerId).map((r) => r.id));
    rows = rows.filter((r) => r.lead || team.has(r.id));
  }
  rows.sort((x, y) => (x.group ?? "").localeCompare(y.group ?? "", "es", { numeric: true }) || ROLES.indexOf(x.role as never) - ROLES.indexOf(y.role as never));
  const count = (s: LiveState) => rows.filter((r) => r.state === s).length;
  return {
    event,
    rows,
    summary: { total: rows.length, trabajando: count("trabajando"), retraso: count("retraso"), esperando: count("esperando"), terminado: count("terminado") },
  };
}

export { INCIDENT_LABEL, INCIDENT_TYPES } from "./incidentTypes";
