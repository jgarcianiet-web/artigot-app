import { db } from "./db";
import { addDays, callTime } from "./domain";

/**
 * Puntuación de cada trabajador (0-100) para la selección automática.
 *
 *   puntuación = calidad − fiabilidad − rotación
 *
 * CALIDAD (0-100): media de las valoraciones de los maîtres, pesando más las recientes
 *   (una valoración pierde la mitad de su peso cada HALF_LIFE_DAYS). La valoración de RRHH
 *   de la ficha (estrellas) cuenta como PRIOR_WEIGHT valoraciones: es el punto de partida
 *   de quien aún no tiene valoraciones y se va diluyendo según llegan.
 * FIABILIDAD (últimos 12 meses): resta por no presentarse, por retirarse después de confirmar
 *   y por fichar tarde (más de LATE_GRACE_MIN minutos después de la citación).
 * ROTACIÓN: resta un poco por cada servicio de los últimos 30 días, para repartir el trabajo
 *   entre quienes tienen puntuaciones parecidas.
 */
export const SCORING = {
  HALF_LIFE_DAYS: 180,
  PRIOR_WEIGHT: 2,
  NO_SHOW_PENALTY: 25,
  WITHDRAWAL_PENALTY: 8,
  LATE_PENALTY: 4,
  LATE_GRACE_MIN: 10,
  ROTATION_PENALTY: 2,
  ROTATION_DAYS: 30,
  RELIABILITY_DAYS: 365,
} as const;

export const CRITERIA = [
  { key: "punctuality", label: "Puntualidad" },
  { key: "appearance", label: "Imagen y uniforme" },
  { key: "service", label: "Calidad del servicio" },
  { key: "attitude", label: "Actitud y equipo" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export type Score = {
  score: number;
  quality: number;
  average: number; // media ponderada 1-5 (incluye la valoración de RRHH)
  reviewCount: number;
  noShows: number;
  withdrawals: number;
  lates: number;
  recentEvents: number;
  penalties: { reliability: number; rotation: number };
};

/** Media de los criterios valorados en una reseña (1-5), o null si no se presentó. */
export function reviewAverage(r: Partial<Record<CriterionKey, number | null>> & { noShow: boolean }) {
  if (r.noShow) return null;
  const values = CRITERIA.map((c) => r[c.key]).filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Minutos de retraso al fichar la entrada respecto a la citación (negativo = antes). */
export function lateMinutes(checkIn: string, call: string) {
  let diff = minutes(checkIn) - minutes(call);
  if (diff < -720) diff += 1440; // citación antes de medianoche y entrada después
  if (diff > 720) diff -= 1440;
  return diff;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Calcula la puntuación de los trabajadores indicados a fecha `refDate` (YYYY-MM-DD). */
export async function computeScores(workerIds: string[], refDate: string) {
  const result = new Map<string, Score>();
  if (!workerIds.length) return result;
  const since = addDays(refDate, -SCORING.RELIABILITY_DAYS);
  const [workers, reviews, assignments] = await Promise.all([
    db.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, rating: true } }),
    db.review.findMany({
      where: { workerId: { in: workerIds }, event: { date: { lte: refDate } } },
      select: { workerId: true, noShow: true, punctuality: true, appearance: true, service: true, attitude: true, event: { select: { date: true } } },
    }),
    db.assignment.findMany({
      where: { workerId: { in: workerIds }, event: { date: { gte: since, lte: refDate } } },
      select: {
        workerId: true,
        role: true,
        status: true,
        withdrew: true,
        checkIn: true,
        group: { select: { callTime: true } },
        event: { select: { date: true, startTime: true, unloadTime: true } },
      },
    }),
  ]);

  const refTime = new Date(`${refDate}T12:00:00Z`).getTime();
  const rotationFrom = addDays(refDate, -SCORING.ROTATION_DAYS);

  for (const w of workers) {
    // Calidad
    let weight = SCORING.PRIOR_WEIGHT;
    let sum = SCORING.PRIOR_WEIGHT * w.rating;
    let reviewCount = 0;
    let noShows = 0;
    for (const r of reviews.filter((r) => r.workerId === w.id)) {
      const ageDays = Math.max(0, (refTime - new Date(`${r.event.date}T12:00:00Z`).getTime()) / 86_400_000);
      if (r.noShow) {
        if (r.event.date >= since) noShows++;
        continue;
      }
      const avg = reviewAverage(r);
      if (avg == null) continue;
      const wgt = 0.5 ** (ageDays / SCORING.HALF_LIFE_DAYS);
      weight += wgt;
      sum += wgt * avg;
      reviewCount++;
    }
    const average = sum / weight;
    const quality = ((average - 1) / 4) * 100;

    // Fiabilidad y rotación
    const mine = assignments.filter((a) => a.workerId === w.id);
    const withdrawals = mine.filter((a) => a.withdrew).length;
    const lates = mine.filter(
      (a) => a.status === "CONFIRMADO" && a.checkIn && lateMinutes(a.checkIn, callTime(a.event, a.role, a.group)) > SCORING.LATE_GRACE_MIN,
    ).length;
    const recentEvents = mine.filter((a) => a.status === "CONFIRMADO" && a.event.date >= rotationFrom && a.event.date < refDate).length;
    const reliability =
      noShows * SCORING.NO_SHOW_PENALTY + withdrawals * SCORING.WITHDRAWAL_PENALTY + lates * SCORING.LATE_PENALTY;
    const rotation = recentEvents * SCORING.ROTATION_PENALTY;

    result.set(w.id, {
      score: round1(Math.max(0, Math.min(100, quality - reliability - rotation))),
      quality: round1(quality),
      average: Math.round(average * 100) / 100,
      reviewCount,
      noShows,
      withdrawals,
      lates,
      recentEvents,
      penalties: { reliability, rotation },
    });
  }
  return result;
}

/** Texto corto que explica una puntuación (para tooltips y fichas). */
export function explainScore(s: Score) {
  const parts = [
    `Calidad ${s.quality} (media ${s.average.toFixed(2).replace(".", ",")}/5, ${s.reviewCount} valoraciones)`,
  ];
  if (s.noShows) parts.push(`−${s.noShows * SCORING.NO_SHOW_PENALTY} por ${s.noShows} ausencia(s)`);
  if (s.withdrawals) parts.push(`−${s.withdrawals * SCORING.WITHDRAWAL_PENALTY} por ${s.withdrawals} retirada(s)`);
  if (s.lates) parts.push(`−${s.lates * SCORING.LATE_PENALTY} por ${s.lates} retraso(s)`);
  if (s.recentEvents) parts.push(`−${s.penalties.rotation} rotación (${s.recentEvents} servicios en 30 días)`);
  return parts.join(" · ");
}
