import { auditAdmin } from "./audit";
import { db } from "./db";
import { addDays, ROLE_LABEL, today, type Role } from "./domain";

/**
 * Altas y bajas automáticas en la Seguridad Social a partir del personal confirmado.
 *
 * Los días seguidos que trabaja una persona forman un único periodo: alta el primer día y baja el
 * último (o el día siguiente si el servicio pasa de medianoche). Si el 1 trabajan 8 y el 2 trabajan
 * otros 8, de los que 5 repiten: esos 5 «siguen» el día 1, los otros 3 son baja el día 1 y hay 3
 * altas nuevas el día 2.
 *
 * Se recalcula solo (al abrir Altas y bajas y cada pocos minutos). Nunca borra ni cambia en silencio
 * algo ya comunicado a la Seguridad Social: lo deja marcado con un aviso para revisarlo en RED.
 */

export const AUTO_CONTRACT = "Fijo discontinuo";
export const AUTO_END_REASON = "Fin de llamamiento (fijo discontinuo)";
/** Días hacia atrás para saber dónde empieza cada bloque de días seguidos */
const LOOKBACK_DAYS = 30;
/** Solo se generan o cambian periodos que terminan desde hace 3 días (plazo para comunicar la baja):
 *  lo anterior ya lo ha tramitado RRHH y no se toca. */
const ACT_DAYS = 3;
const AHEAD_DAYS = 120;

type Work = { date: string; overnight: boolean; role: string; event: string };

/** Días que trabaja cada persona (servicios confirmados) en el periodo. */
async function workDays(from: string, to: string, workerIds?: string[]) {
  const rows = await db.assignment.findMany({
    where: { status: "CONFIRMADO", event: { date: { gte: from, lte: to } }, ...(workerIds && { workerId: { in: workerIds } }) },
    select: { workerId: true, role: true, event: { select: { date: true, startTime: true, endTime: true, name: true } } },
  });
  const by = new Map<string, Map<string, Work>>();
  for (const a of rows) {
    const days = by.get(a.workerId) ?? new Map<string, Work>();
    const prev = days.get(a.event.date);
    const overnight = !!a.event.endTime && a.event.endTime < a.event.startTime;
    days.set(a.event.date, { date: a.event.date, overnight: overnight || !!prev?.overnight, role: prev?.role ?? a.role, event: prev ? `${prev.event}, ${a.event.name}` : a.event.name });
    by.set(a.workerId, days);
  }
  return by;
}

/** Bloques de días seguidos. */
function streaks(days: Map<string, Work>) {
  const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const out: { start: string; end: string; last: string; works: Work[] }[] = [];
  for (const w of sorted) {
    const cur = out.at(-1);
    if (cur && addDays(cur.last, 1) === w.date) {
      cur.last = w.date;
      cur.works.push(w);
    } else out.push({ start: w.date, last: w.date, end: w.date, works: [w] });
  }
  for (const s of out) s.end = s.works.at(-1)!.overnight ? addDays(s.last, 1) : s.last;
  return out;
}

const overlaps = (a: { startDate: string; endDate: string | null }, start: string, end: string) => a.startDate <= end && (a.endDate ?? "9999-12-31") >= start;

export async function syncAutoEmployments(opts: { actor?: string } = {}) {
  const t = today();
  const from = addDays(t, -ACT_DAYS);
  const to = addDays(t, AHEAD_DAYS);
  return db.$transaction(
    async (tx) => {
      // Una sola sincronización a la vez (página y recordatorios pueden coincidir)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724001)`;
      const work = await workDays(addDays(t, -LOOKBACK_DAYS), addDays(to, 1));
      const employments = await tx.employment.findMany({ where: { OR: [{ endDate: null }, { endDate: { gte: from } }], startDate: { lte: addDays(to, 1) } } });
      const byWorker = new Map<string, typeof employments>();
      for (const e of employments) byWorker.set(e.workerId, [...(byWorker.get(e.workerId) ?? []), e]);

      let created = 0;
      let updated = 0;
      let removed = 0;
      const kept = new Set<string>();
      for (const [workerId, days] of work) {
        const mine = byWorker.get(workerId) ?? [];
        for (const s of streaks(days)) {
          if (s.end < from || s.start > to) continue;
          // Las altas puestas a mano mandan: no se tocan
          if (mine.some((e) => !e.auto && overlaps(e, s.start, s.end))) continue;
          const autos = mine.filter((e) => e.auto && overlaps(e, s.start, s.end) && !kept.has(e.id));
          const role = ROLE_LABEL[s.works[0].role as Role] ?? s.works[0].role;
          const notes = `Servicios: ${s.works.map((w) => w.event).join(" · ")}`.slice(0, 500);
          if (!autos.length) {
            const e = await tx.employment.create({
              data: { workerId, startDate: s.start, endDate: s.end, contractType: AUTO_CONTRACT, category: role, endReason: AUTO_END_REASON, notes, auto: true, createdBy: "Automático" },
            });
            kept.add(e.id);
            created++;
            continue;
          }
          const [e, ...extra] = autos;
          kept.add(e.id);
          const startChanged = e.startDate !== s.start;
          const endChanged = e.endDate !== s.end;
          const warnings = [
            startChanged && e.startReported && `El alta comunicada era el ${e.startDate}; ahora empieza el ${s.start}. Corrígela en RED.`,
            endChanged && e.endReported && `La baja comunicada era el ${e.endDate}; ahora termina el ${s.end}. Corrígela en RED.`,
          ].filter(Boolean) as string[];
          if (startChanged || endChanged || e.notes !== notes || (e.warning && !warnings.length && !extra.length)) {
            await tx.employment.update({
              where: { id: e.id },
              data: {
                startDate: s.start, endDate: s.end, notes, category: role,
                ...(startChanged && { startReported: false }),
                ...(endChanged && { endReported: false }),
                warning: warnings.join(" ") || null,
              },
            });
            if (startChanged || endChanged) updated++;
          }
          // Dos periodos que ahora son seguidos se unen en uno
          for (const x of extra) {
            if (x.startReported || x.endReported) {
              kept.add(x.id);
              await tx.employment.update({ where: { id: x.id }, data: { warning: `Se ha unido con el periodo del ${s.start}: anula este en RED si ya lo comunicaste.` } });
            } else {
              await tx.employment.delete({ where: { id: x.id } });
              removed++;
            }
          }
        }
      }
      // Periodos automáticos que ya no corresponden a ningún servicio (p. ej. se canceló)
      for (const e of employments) {
        if (!e.auto || kept.has(e.id) || (e.endDate ?? "9999-12-31") < from || e.startDate > to) continue;
        if (!e.startReported && !e.endReported) {
          await tx.employment.delete({ where: { id: e.id } });
          removed++;
        } else if (!e.warning?.startsWith("Ya no tiene servicios")) {
          await tx.employment.update({ where: { id: e.id }, data: { warning: "Ya no tiene servicios en estas fechas: anula el alta en RED." } });
        }
      }
      if (created || updated || removed) {
        await auditAdmin(opts.actor ?? "Automático", "Alta S. S.", "Altas automáticas", `Altas y bajas actualizadas según el personal confirmado: ${created} nuevas, ${updated} cambiadas, ${removed} anuladas`);
      }
      return { created, updated, removed };
    },
    { timeout: 60_000 },
  );
}

// ---------- Vista día a día ----------

export type DayRow = {
  workerId: string;
  name: string;
  dni: string | null;
  nss: string | null;
  a3Code: string | null;
  role: string;
  events: string;
  /** Empieza hoy (no trabajó ayer) */
  alta: boolean;
  /** Trabaja también mañana */
  sigue: boolean;
  /** Fecha de la baja si hoy es su último día (el día siguiente si pasa de medianoche) */
  bajaDate: string | null;
  employment: { id: string; startDate: string; endDate: string | null; startReported: boolean; endReported: boolean; auto: boolean; warning: string | null } | null;
};

export async function dayMovements(date: string) {
  const work = await workDays(addDays(date, -1), addDays(date, 1));
  const ids = [...work.entries()].filter(([, d]) => d.has(date)).map(([id]) => id);
  const [workers, employments] = await Promise.all([
    db.worker.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, dni: true, nss: true, a3Code: true } }),
    db.employment.findMany({ where: { workerId: { in: ids }, startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }] } }),
  ]);
  const rows: DayRow[] = workers.map((w) => {
    const days = work.get(w.id)!;
    const today_ = days.get(date)!;
    const sigue = days.has(addDays(date, 1));
    const e = employments.find((x) => x.workerId === w.id) ?? null;
    return {
      workerId: w.id, name: w.name, dni: w.dni, nss: w.nss, a3Code: w.a3Code, role: today_.role, events: today_.event,
      alta: !days.has(addDays(date, -1)),
      sigue,
      bajaDate: sigue ? null : today_.overnight ? addDays(date, 1) : date,
      employment: e && { id: e.id, startDate: e.startDate, endDate: e.endDate, startReported: e.startReported, endReported: e.endReported, auto: e.auto, warning: e.warning },
    };
  });
  rows.sort((a, b) => Number(b.alta) - Number(a.alta) || a.name.localeCompare(b.name, "es"));
  // Bajas con fecha de hoy (incluye las de un servicio de ayer que pasó de medianoche)
  const bajasDelDia = await db.employment.findMany({ where: { endDate: date }, select: { id: true, worker: { select: { name: true, a3Code: true } } } });
  const altasDelDia = await db.employment.count({ where: { startDate: date } });
  return {
    rows,
    bajasDelDia: bajasDelDia.map((e) => ({ name: e.worker.name, a3Code: e.worker.a3Code })),
    altasDelDia,
    altas: rows.filter((r) => r.alta).length,
    siguen: rows.filter((r) => r.sigue).length,
    bajas: rows.filter((r) => !r.sigue).length,
  };
}

/** Avisos pendientes (cambios después de comunicar a RED). */
export const employmentWarnings = () =>
  db.employment.findMany({ where: { warning: { not: null } }, include: { worker: { select: { id: true, name: true } } }, orderBy: { startDate: "asc" } });
