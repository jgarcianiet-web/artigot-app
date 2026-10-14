import { db } from "./db";

/** Día (YYYY-MM-DD) en Madrid. */
const madridDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

/**
 * Personal nuevo: quien se da de alta desde Candidatos lleva la etiqueta «Nuevo» hasta haber trabajado
 * NEWCOMER_GOAL.BODA bodas y NEWCOMER_GOAL.EVENTO eventos (cualquier otro tipo de servicio cuenta como evento).
 * Así RRHH ve cuánta gente nueva lleva a cada evento.
 */
export const NEWCOMER_GOAL = { BODA: 3, EVENTO: 4 } as const;

export type NewcomerProgress = { bodas: number; eventos: number };

export const newcomerText = (p: NewcomerProgress) =>
  `Nuevo: lleva ${Math.min(p.bodas, NEWCOMER_GOAL.BODA)} de ${NEWCOMER_GOAL.BODA} bodas y ${Math.min(p.eventos, NEWCOMER_GOAL.EVENTO)} de ${NEWCOMER_GOAL.EVENTO} eventos`;

const done = (p: NewcomerProgress) => p.bodas >= NEWCOMER_GOAL.BODA && p.eventos >= NEWCOMER_GOAL.EVENTO;

/**
 * Progreso de quienes siguen siendo nuevos (de entre `workerIds`, o de todos si no se indica). Cuenta los servicios
 * confirmados desde que es nuevo y hasta el día anterior a `today`. Quien ya los ha completado deja de ser nuevo (se guarda).
 */
export async function newcomers(today: string, workerIds?: string[]) {
  const ws = await db.worker.findMany({
    where: { newcomerSince: { not: null }, ...(workerIds && { id: { in: workerIds } }) },
    select: {
      id: true,
      newcomerSince: true,
      assignments: { where: { status: "CONFIRMADO", event: { date: { lt: today } } }, select: { event: { select: { type: true, date: true } } } },
    },
  });
  const result = new Map<string, NewcomerProgress>();
  const finished: string[] = [];
  for (const w of ws) {
    const since = madridDate(w.newcomerSince!);
    const mine = w.assignments.filter((a) => a.event.date >= since);
    const bodas = mine.filter((a) => a.event.type === "BODA").length;
    const p = { bodas, eventos: mine.length - bodas };
    if (done(p)) finished.push(w.id);
    else result.set(w.id, p);
  }
  if (finished.length) await db.worker.updateMany({ where: { id: { in: finished } }, data: { newcomerSince: null } });
  return result;
}
