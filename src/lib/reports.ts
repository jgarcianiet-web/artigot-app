import { db } from "./db";
import { callTime } from "./domain";
import { INCIDENT_LABEL } from "./incidentTypes";
import { payrollLines } from "./payroll";
import { lateMinutes, reviewAverage, SCORING } from "./scoring";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function monthKeys(to: string, count: number) {
  const [y, m] = to.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    const key = d.toISOString().slice(0, 7);
    return { key, label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` };
  });
}

/** Datos del informe de RRHH para un periodo. */
export async function buildReport(from: string, to: string) {
  const months = monthKeys(to, 12);
  const trendFrom = `${months[0].key}-01`;

  const [lines, trendLines, assignments, events, reviews, incidents] = await Promise.all([
    payrollLines(from, to),
    payrollLines(trendFrom, to),
    db.assignment.findMany({
      where: { event: { date: { gte: from, lte: to } } },
      select: {
        workerId: true,
        role: true,
        status: true,
        withdrew: true,
        checkIn: true,
        group: { select: { callTime: true } },
        createdAt: true,
        respondedAt: true,
        event: { select: { date: true, startTime: true, unloadTime: true } },
        worker: { select: { name: true } },
      },
    }),
    db.event.findMany({
      where: { date: { gte: from, lte: to } },
      select: { id: true, name: true, date: true, client: true, _count: { select: { incidents: true } } },
      orderBy: { date: "asc" },
    }),
    db.review.findMany({
      where: { event: { date: { gte: from, lte: to } } },
      select: { workerId: true, noShow: true, punctuality: true, appearance: true, service: true, attitude: true },
    }),
    db.incident.groupBy({ by: ["type"], where: { event: { date: { gte: from, lte: to } } }, _count: true }),
  ]);

  // Por evento
  const byEvent = events.map((e) => {
    const ls = lines.filter((l) => l.a.eventId === e.id);
    return {
      ...e,
      staff: ls.length,
      hours: ls.reduce((s, l) => s + (l.billedHours ?? 0), 0),
      cost: ls.reduce((s, l) => s + l.amount, 0),
      missingHours: ls.filter((l) => l.hours == null).length,
    };
  });

  // Por trabajador
  type Row = {
    workerId: string;
    name: string;
    services: number;
    hours: number;
    cost: number;
    rejected: number;
    withdrawals: number;
    lates: number;
    noShows: number;
    reviewSum: number;
    reviewCount: number;
  };
  const byWorker = new Map<string, Row>();
  const row = (id: string, name: string) => {
    let r = byWorker.get(id);
    if (!r) {
      r = { workerId: id, name, services: 0, hours: 0, cost: 0, rejected: 0, withdrawals: 0, lates: 0, noShows: 0, reviewSum: 0, reviewCount: 0 };
      byWorker.set(id, r);
    }
    return r;
  };
  for (const l of lines) {
    const r = row(l.a.workerId, l.a.worker.name);
    r.services++;
    r.hours += l.billedHours ?? 0;
    r.cost += l.amount;
  }
  for (const a of assignments) {
    const r = row(a.workerId, a.worker.name);
    if (a.status === "RECHAZADO" && !a.withdrew) r.rejected++;
    if (a.withdrew) r.withdrawals++;
    if (a.status === "CONFIRMADO" && a.checkIn && lateMinutes(a.checkIn, callTime(a.event, a.role, a.group)) > SCORING.LATE_GRACE_MIN) r.lates++;
  }
  for (const rv of reviews) {
    const r = byWorker.get(rv.workerId);
    if (!r) continue;
    if (rv.noShow) r.noShows++;
    const avg = reviewAverage(rv);
    if (avg != null) {
      r.reviewSum += avg;
      r.reviewCount++;
    }
  }
  const workers = [...byWorker.values()]
    .map((r) => ({ ...r, avgReview: r.reviewCount ? r.reviewSum / r.reviewCount : null }))
    .sort((a, b) => b.services - a.services || a.name.localeCompare(b.name));

  // Respuesta a convocatorias
  const responded = assignments.filter((a) => a.respondedAt && ["CONFIRMADO", "RECHAZADO"].includes(a.status));
  const avgResponseH = responded.length
    ? responded.reduce((s, a) => s + (a.respondedAt!.getTime() - a.createdAt.getTime()) / 3_600_000, 0) / responded.length
    : null;
  const invited = assignments.filter((a) => a.status !== "CANCELADO").length;
  const accepted = assignments.filter((a) => a.status === "CONFIRMADO").length;

  // Coste por mes (últimos 12 meses hasta el final del periodo)
  const trend = months.map((m) => ({
    ...m,
    cost: trendLines.filter((l) => l.a.event.date.startsWith(m.key)).reduce((s, l) => s + l.amount, 0),
    services: trendLines.filter((l) => l.a.event.date.startsWith(m.key)).length,
  }));

  return {
    kpis: {
      events: events.length,
      services: lines.length,
      hours: lines.reduce((s, l) => s + (l.billedHours ?? 0), 0),
      cost: lines.reduce((s, l) => s + l.amount, 0),
      incidents: incidents.reduce((s, i) => s + i._count, 0),
      acceptRate: invited ? accepted / invited : null,
      avgResponseH,
    },
    byEvent,
    workers,
    incidents: incidents.map((i) => ({ type: i.type, label: INCIDENT_LABEL[i.type] ?? i.type, count: i._count })).sort((a, b) => b.count - a.count),
    trend,
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;
