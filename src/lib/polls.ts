import { db } from "./db";
import { addDays, today, workerRoles } from "./domain";

/**
 * Sondeos de disponibilidad: RRHH pregunta «¿qué días puedes trabajar?» antes de convocar.
 * - «No puedo» marca ese día como no disponible (así no se le convoca).
 * - «Puedo» le pone primero en la lista de candidatos de los eventos de ese día y en el autocompletar.
 */

export const POLL_REASON = "Sondeo";
export const MAX_POLL_DATES = 31;

/** Días entre dos fechas que caen en los días de la semana elegidos (0 = domingo … 6 = sábado). */
export function datesBetween(from: string, to: string, weekdays: number[]) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < MAX_POLL_DATES; d = addDays(d, 1)) {
    if (!weekdays.length || weekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) out.push(d);
  }
  return out;
}

/** Sondeos abiertos que le afectan a un trabajador (por puesto) con alguna fecha futura, y sus respuestas. */
export async function openPollsFor(worker: { id: string; role: string; roles: string[] }) {
  const t = today();
  const polls = await db.availabilityPoll.findMany({
    where: { closedAt: null },
    include: { answers: { where: { workerId: worker.id } } },
    orderBy: { createdAt: "desc" },
  });
  const mine = new Set(workerRoles(worker));
  return polls
    .filter((p) => !p.roles.length || p.roles.some((r) => mine.has(r as never)))
    .map((p) => ({ ...p, dates: p.dates.filter((d) => d >= t) }))
    .filter((p) => p.dates.length > 0);
}

/** Guarda la respuesta de un día y actualiza su disponibilidad. */
export async function answerPoll(workerId: string, pollId: string, date: string, available: boolean) {
  const poll = await db.availabilityPoll.findUnique({ where: { id: pollId } });
  if (!poll || poll.closedAt || !poll.dates.includes(date) || date < today()) return false;
  await db.pollAnswer.upsert({
    where: { pollId_workerId_date: { pollId, workerId, date } },
    create: { pollId, workerId, date, available },
    update: { available, answeredAt: new Date() },
  });
  const un = await db.unavailability.findUnique({ where: { workerId_date: { workerId, date } } });
  if (!available && !un) await db.unavailability.create({ data: { workerId, date, reason: POLL_REASON } });
  // Solo se quita la no disponibilidad que puso el propio sondeo (no la que marcó a mano)
  if (available && un?.reason === POLL_REASON) await db.unavailability.delete({ where: { id: un.id } });
  return true;
}

/** Quién ha dicho que puede trabajar ese día (en sondeos abiertos). */
export async function availableOn(date: string) {
  const rows = await db.pollAnswer.findMany({ where: { date, available: true, poll: { closedAt: null } }, select: { workerId: true } });
  return new Set(rows.map((r) => r.workerId));
}
