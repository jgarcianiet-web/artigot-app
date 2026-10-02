import ExcelJS from "exceljs";
import { db } from "./db";
import { addDays, callTime, clocksIn, costHours, hoursBetween, isFixed, payable, rateFor, ROLE_LABEL, type Role } from "./domain";
import { movementsBetween } from "./autoAltas";
import { monthRange } from "./payroll";

/**
 * Cuadrante semanal (como el Excel «CAMAREROS» de RRHH): cada día, sus eventos y quién va, con su
 * horario y su importe; y a la derecha el recuento del mes de los fijos frente a su nómina.
 * Se genera solo con los eventos y las convocatorias: no hay que escribir nada dos veces.
 */

export type ScheduleStaff = {
  assignmentId: string;
  workerId: string;
  name: string;
  role: string;
  status: string;
  fixed: boolean;
  /** «18:00/CIERRE», o la entrada y salida fichadas */
  time: string;
  clocked: boolean;
  amount: number;
  /** Seguridad Social de los extras confirmados: alta ese día, sigue al día siguiente o baja */
  ss?: "ALTA" | "BAJA" | "ALTA_BAJA" | "CONTINUA";
};
export type ScheduleEvent = { id: string; name: string; venue: string; type: string; status: string; time: string; staff: ScheduleStaff[]; total: number; confirmed: number; needed: number; draft?: boolean };

/** Lunes de la semana de una fecha. */
export function weekStart(date: string) {
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

export async function weekSchedule(monday: string) {
  const sunday = addDays(monday, 6);
  const [events, rates, drafts, moves] = await Promise.all([
    db.event.findMany({
      where: { date: { gte: monday, lte: sunday } },
      include: {
        assignments: {
          where: { status: { in: ["CONVOCADO", "CONFIRMADO"] } },
          include: { worker: { select: { id: true, name: true, customRates: true, contractCode: true, noClock: true } } },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.rate.findMany(),
    db.eventDraft.findMany({ where: { date: { gte: monday, lte: sunday } }, orderBy: { createdAt: "asc" } }),
    movementsBetween(monday, sunday),
  ]);
  const ssOf = (workerId: string, date: string): ScheduleStaff["ss"] => {
    const m = moves.get(`${workerId}|${date}`);
    if (!m) return undefined;
    return m.alta ? (m.sigue ? "ALTA" : "ALTA_BAJA") : m.sigue ? "CONTINUA" : "BAJA";
  };
  // Borradores: el personal previsto, con su importe según el horario del borrador
  const draftWorkers = await db.worker.findMany({
    where: { id: { in: drafts.flatMap((d) => (d.staff as { workerId: string }[]).map((x) => x.workerId)) } },
    select: { id: true, name: true, customRates: true, contractCode: true },
  });
  const dw = new Map(draftWorkers.map((w) => [w.id, w]));
  const draftEvents = drafts.map((d): ScheduleEvent & { date: string; startTime: string } => {
    const f = d.form as Record<string, string>;
    const ev = { startTime: f.startTime || "00:00", endTime: f.endTime || null, unloadTime: f.unloadTime || null, type: f.type || "EVENTO" };
    const staff = (d.staff as { workerId: string; role: string }[])
      .filter((x) => dw.has(x.workerId))
      .map((x): ScheduleStaff => {
        const w = dw.get(x.workerId)!;
        const call = callTime(ev, x.role);
        return {
          assignmentId: `${d.id}-${x.workerId}`, workerId: x.workerId, name: w.name, role: x.role, status: "PREVISTO", fixed: isFixed(w),
          time: `${call}/${ev.endTime ?? "CIERRE"}`, clocked: false,
          amount: payable(hoursBetween(call, ev.endTime), rateFor(rates, x.role, ev.type, w.customRates)).amount,
        };
      });
    const need = (k: string) => Number(f[k]) || 0;
    return {
      id: d.id, draft: true, date: d.date, startTime: ev.startTime, name: d.name, venue: f.venue || "", type: ev.type, status: "BORRADOR",
      time: `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}`, staff,
      total: Math.round(staff.reduce((s, x) => s + x.amount, 0) * 100) / 100,
      confirmed: staff.length, needed: need("needCamareros") + need("needResponsables") + need("needMaitres") + need("needMozos"),
    };
  });
  const order = (r: string) => ["MAITRE", "RESPONSABLE", "CAMARERO", "MOZO"].indexOf(r);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => ({
    date,
    // Movimientos del día para la Seguridad Social (una persona cuenta una vez aunque tenga dos eventos)
    ss: [...moves.entries()].filter(([k]) => k.endsWith(`|${date}`)).reduce(
      (c, [, m]) => ({ altas: c.altas + Number(m.alta), bajas: c.bajas + Number(!m.sigue), siguen: c.siguen + Number(m.sigue) }),
      { altas: 0, bajas: 0, siguen: 0 },
    ),
    events: events
      .filter((e) => e.date === date)
      .map((e): ScheduleEvent => {
        const staff = e.assignments
          .map((a): ScheduleStaff => {
            const call = callTime(e, a.role);
            const clocked = !!a.checkIn;
            const hours = costHours(a, a.worker, e) ?? hoursBetween(call, e.endTime);
            return {
              assignmentId: a.id, workerId: a.workerId, name: a.worker.name, role: a.role, status: a.status, fixed: isFixed(a.worker),
              time: clocked ? `${a.checkIn}/${a.checkOut ?? "…"}` : `${call}/${e.endTime ?? "CIERRE"}`,
              clocked,
              amount: payable(hours, rateFor(rates, a.role, e.type, a.worker.customRates)).amount,
              ss: a.status === "CONFIRMADO" ? ssOf(a.workerId, e.date) : undefined,
            };
          })
          .sort((x, y) => order(x.role) - order(y.role) || x.name.localeCompare(y.name, "es"));
        return {
          id: e.id, name: e.name, venue: e.venue, type: e.type, status: e.status, time: `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`,
          staff,
          total: Math.round(staff.reduce((s, x) => s + x.amount, 0) * 100) / 100,
          confirmed: staff.filter((s) => s.status === "CONFIRMADO").length,
          needed: e.needCamareros + e.needResponsables + e.needMaitres + e.needMozos,
        };
      })
      .concat(draftEvents.filter((x) => x.date === date).map(({ date: _d, startTime: _s, ...x }) => x)),
  }));

  // Recuento de fijos: la semana entera y el mes del domingo hasta el domingo (la semana puede
  // empezar en el mes anterior). Como en el cuadrante, lo que aún no se ha fichado cuenta con el
  // horario previsto.
  const { from } = monthRange(sunday);
  const start = from < monday ? from : monday;
  const fixed = await db.worker.findMany({
    where: { active: true, contractCode: { in: ["100", "200"] } },
    select: {
      id: true, name: true, monthlySalary: true, noClock: true, contractCode: true, customRates: true,
      assignments: { where: { status: "CONFIRMADO", event: { date: { gte: start, lte: sunday } } }, include: { event: true } },
    },
    orderBy: { name: "asc" },
  });
  const value = (w: (typeof fixed)[number], since: string) =>
    Math.round(
      w.assignments
        .filter((a) => a.event.date >= since)
        .reduce((s, a) => s + payable(costHours(a, w, a.event) ?? hoursBetween(callTime(a.event, a.role), a.event.endTime), rateFor(rates, a.role, a.event.type, w.customRates)).amount, 0) * 100,
    ) / 100;
  const fixedRows = fixed.map((w) => {
    const month = value(w, from);
    return { id: w.id, name: w.name, week: value(w, monday), value: month, salary: w.monthlySalary, clocks: clocksIn(w), left: w.monthlySalary != null ? Math.round((w.monthlySalary - month) * 100) / 100 : null };
  });
  return { monday, sunday, monthFrom: from, days, fixed: fixedRows };
}

const dayName = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
export const dayLabel = (d: string) => dayName.format(new Date(`${d}T12:00:00Z`)).toUpperCase();
export const weekLabel = (monday: string) => `${shortDate.format(new Date(`${monday}T12:00:00Z`))} – ${shortDate.format(new Date(`${addDays(monday, 6)}T12:00:00Z`))}`.toUpperCase();

/** Excel con la misma forma que el que usaba RRHH: un bloque de columnas por día y el recuento de fijos a la derecha. */
export async function scheduleWorkbook(s: Awaited<ReturnType<typeof weekSchedule>>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(weekLabel(s.monday).replace(/[\\/*?:[\]]/g, "-").slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  const days = s.days.filter((d) => d.events.length);
  const thin = { style: "thin" as const, color: { argb: "FFD6D3D1" } };
  let col = 1;
  for (const d of days) {
    ws.getColumn(col).width = 4;
    ws.getColumn(col + 1).width = 24;
    ws.getColumn(col + 2).width = 13;
    ws.getColumn(col + 3).width = 9;
    ws.getColumn(col + 4).width = 2;
    ws.mergeCells(1, col, 1, col + 3);
    const h = ws.getCell(1, col);
    h.value = dayLabel(d.date);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1917" } };
    h.alignment = { horizontal: "center" };
    let row = 2;
    for (const e of d.events) {
      ws.mergeCells(row, col, row, col + 3);
      const t = ws.getCell(row, col);
      t.value = `${e.name.toUpperCase()}${e.status === "CANCELADO" ? " (CANCELADO)" : e.draft ? " (BORRADOR)" : ""}`;
      t.font = { bold: true };
      t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
      t.alignment = { horizontal: "center" };
      row++;
      e.staff.forEach((p, i) => {
        const r = ws.getRow(row);
        r.getCell(col).value = i + 1;
        r.getCell(col + 1).value = `${p.name}${p.role !== "CAMARERO" ? ` (${ROLE_LABEL[p.role as Role] ?? p.role})` : ""}${p.status === "CONVOCADO" ? " ?" : ""}`;
        r.getCell(col + 2).value = p.time;
        r.getCell(col + 3).value = p.amount;
        r.getCell(col + 3).numFmt = '#,##0.00 "€"';
        if (p.fixed) r.getCell(col + 1).font = { color: { argb: "FF0369A1" } };
        for (let c = col; c <= col + 3; c++) r.getCell(c).border = { bottom: thin };
        row++;
      });
      row++;
    }
    col += 5;
  }
  // Recuento de fijos
  const f = col + 1;
  ws.getColumn(f).width = 24;
  for (const c of [1, 2, 3, 4]) ws.getColumn(f + c).width = 12;
  const head = ["RECUENTO FIJOS", "SEMANA", "MES", "NÓMINA", "RESTA"];
  head.forEach((v, i) => {
    const c = ws.getCell(1, f + i);
    c.value = v;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
  });
  s.fixed.forEach((w, i) => {
    const r = ws.getRow(2 + i);
    r.getCell(f).value = w.name;
    [w.week, w.value, w.salary, w.left].forEach((v, j) => {
      const c = r.getCell(f + 1 + j);
      c.value = v;
      c.numFmt = '#,##0.00 "€"';
    });
    if (w.left != null && w.left < 0) r.getCell(f + 4).font = { bold: true, color: { argb: "FF047857" } };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
