import ExcelJS from "exceljs";
import { db } from "./db";
import { addDays, callTime, clocksIn, costHours, hoursBetween, isFixed, payable, rateFor, ROLE_LABEL, type Role } from "./domain";
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
};
export type ScheduleEvent = { id: string; name: string; venue: string; type: string; status: string; time: string; staff: ScheduleStaff[]; total: number; confirmed: number; needed: number };

/** Lunes de la semana de una fecha. */
export function weekStart(date: string) {
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

export async function weekSchedule(monday: string) {
  const sunday = addDays(monday, 6);
  const [events, rates] = await Promise.all([
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
  ]);
  const order = (r: string) => ["MAITRE", "RESPONSABLE", "CAMARERO", "MOZO"].indexOf(r);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => ({
    date,
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
      }),
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
      t.value = `${e.name.toUpperCase()}${e.status === "CANCELADO" ? " (CANCELADO)" : ""}`;
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
