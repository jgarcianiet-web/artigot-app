import { db } from "./db";
import { addDays, needFor, ROLES, type Role } from "./domain";

export const ACTIVE_STATUSES = ["CONVOCADO", "CONFIRMADO"];

export type Candidate = {
  id: string;
  name: string;
  phone: string;
  role: string;
  rating: number;
  zone: string | null;
  recentEvents: number;
};

/**
 * Trabajadores disponibles para un evento, por puesto.
 * Excluye: inactivos, no disponibles ese día, ya ocupados en otro evento ese día
 * y los que ya están en este evento. Ordena por valoración y, a igualdad,
 * por quien menos ha trabajado en los últimos 30 días (reparto equitativo).
 */
export async function candidatesFor(event: { id: string; date: string }) {
  const [workers, recent] = await Promise.all([
    db.worker.findMany({
      where: {
        active: true,
        unavailabilities: { none: { date: event.date } },
        assignments: {
          none: {
            OR: [
              { eventId: event.id },
              { status: { in: ACTIVE_STATUSES }, event: { date: event.date } },
            ],
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.assignment.groupBy({
      by: ["workerId"],
      where: {
        status: "CONFIRMADO",
        event: { date: { gte: addDays(event.date, -30), lte: event.date } },
      },
      _count: true,
    }),
  ]);
  const recentByWorker = new Map(recent.map((r) => [r.workerId, r._count]));

  const byRole = Object.fromEntries(ROLES.map((r) => [r, [] as Candidate[]])) as Record<Role, Candidate[]>;
  for (const w of workers) {
    const role = w.role as Role;
    if (!byRole[role]) continue;
    byRole[role].push({
      id: w.id,
      name: w.name,
      phone: w.phone,
      role: w.role,
      rating: w.rating,
      zone: w.zone,
      recentEvents: recentByWorker.get(w.id) ?? 0,
    });
  }
  for (const role of ROLES) {
    byRole[role].sort((a, b) => b.rating - a.rating || a.recentEvents - b.recentEvents || a.name.localeCompare(b.name));
  }
  return byRole;
}

/** Huecos por cubrir por puesto: necesarios menos (confirmados + pendientes). */
export function gaps(
  event: { needCamareros: number; needMaitres: number; needMozos: number },
  assignments: { role: string; status: string }[],
) {
  return Object.fromEntries(
    ROLES.map((role) => {
      const taken = assignments.filter((a) => a.role === role && ACTIVE_STATUSES.includes(a.status)).length;
      return [role, Math.max(0, needFor(event, role) - taken)];
    }),
  ) as Record<Role, number>;
}

export function coverage(
  event: { needCamareros: number; needMaitres: number; needMozos: number },
  assignments: { role: string; status: string }[],
) {
  return ROLES.map((role) => {
    const of = (s: string) => assignments.filter((a) => a.role === role && a.status === s).length;
    return { role, need: needFor(event, role), confirmed: of("CONFIRMADO"), pending: of("CONVOCADO") };
  });
}
