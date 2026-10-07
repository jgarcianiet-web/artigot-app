import path from "node:path";
import ExcelJS from "exceljs";
import { getA3 } from "./a3";
import { a3Name, getA3Alta } from "./a3alta";
import { db } from "./db";
import { addDays, EXTRA_WHERE, type Role } from "./domain";
import { deductions, getPaySettings, netOf } from "./pay";
import { monthRange, payrollLines } from "./payroll";

/**
 * Nóminas de los extras para A3, sin ir ficha por ficha. Cada llamamiento (días seguidos de trabajo,
 * con su alta y su baja) es una nómina en A3, y por cada una se rellenan las 4 pantallas que RRHH
 * hacía a mano, con los formatos de importación de A3:
 *  1. Contratación-Fechas: alta, baja y motivo 15 (abre el periodo: «Vida Laboral» = Sí)
 *  2. Datos Contractuales: contrato 300, Tipo General, inicio y fin
 *  3. Plantillas Calendario: los días trabajados con sus horas (jornada parcial)
 *  4. Ajuste Salarial: el líquido pactado (lo que cobra neto) y el concepto del excedente
 * Después A3 calcula todas las nóminas de una vez.
 */

const T = (f: string) => path.join(process.cwd(), "templates", f);
const MOTIVO = "15 Interrupción de la actividad de los trabajadores fijos-discontinuos";
const CONTRATO = "300 - PARA LA REALIZACION DE TRABAJOS FIJO DISCONTINUOS";
const WEEKDAYS = 7;

export type Llamamiento = {
  employmentId: string;
  workerId: string;
  name: string;
  code: string;
  w: { name: string; role: string; firstName: string | null; surname1: string | null; surname2: string | null };
  alta: string;
  baja: string;
  /** Horas de cada día trabajado */
  days: { date: string; hours: number }[];
  services: number;
  hours: number;
  /** Líquido pactado: lo que cobra neto este llamamiento */
  net: number;
};

export async function monthLlamamientos(from: string, to: string) {
  const [employments, s] = await Promise.all([
    db.employment.findMany({
      where: { startDate: { gte: from, lte: to }, worker: EXTRA_WHERE },
      include: { worker: { select: { id: true, name: true, role: true, a3Code: true, firstName: true, surname1: true, surname2: true, irpf: true } } },
      orderBy: [{ worker: { name: "asc" } }, { startDate: "asc" }],
    }),
    getPaySettings(),
  ]);
  const lastEnd = employments.reduce((m, e) => ((e.endDate ?? e.startDate) > m ? (e.endDate ?? e.startDate) : m), to);
  const lines = await payrollLines(from, lastEnd, { extras: true });
  const pct = deductions(s);
  const ok: Llamamiento[] = [];
  const problems: { name: string; workerId: string; alta: string; why: string }[] = [];
  for (const e of employments) {
    const baja = e.endDate ?? e.startDate;
    const mine = lines.filter((l) => l.a.workerId === e.workerId && l.a.event.date >= e.startDate && l.a.event.date <= baja);
    const bad = (why: string) => problems.push({ name: e.worker.name, workerId: e.workerId, alta: e.startDate, why });
    if (!e.worker.a3Code) { bad("Sin código de A3 (va antes en el alta masiva)"); continue; }
    if (!e.endDate) { bad("Alta sin fecha de baja"); continue; }
    if (!mine.length) { bad("No tiene servicios confirmados en esas fechas"); continue; }
    if (mine.some((l) => l.hours == null)) { bad("Servicios sin horas: ficha o corrige las horas"); continue; }
    const byDay = new Map<string, number>();
    for (const l of mine) byDay.set(l.a.event.date, (byDay.get(l.a.event.date) ?? 0) + (l.billedHours ?? 0));
    const irpf = s.ratesAreNet ? 0 : (e.worker.irpf ?? pct.irpfPct);
    const net = Math.round(mine.reduce((sum, l) => sum + (s.ratesAreNet ? l.amount : netOf(l.amount, pct.ssPct, irpf).net), 0) * 100) / 100;
    ok.push({
      employmentId: e.id, workerId: e.workerId, name: e.worker.name, code: e.worker.a3Code, w: e.worker,
      alta: e.startDate, baja,
      days: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, hours]) => ({ date, hours: Math.round(hours * 100) / 100 })),
      services: mine.length, hours: Math.round(mine.reduce((sum, l) => sum + (l.billedHours ?? 0), 0) * 100) / 100, net,
    });
  }
  return { llamamientos: ok, problems };
}

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Lunes = 0 … domingo = 6 */
const weekday = (iso: string) => (date(iso).getUTCDay() + 6) % 7;
/** Como los exporta A3: todo en texto, fechas «dd/mm/aaaa» y el código del trabajador con 6 cifras */
const text = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const code6 = (c: string) => (/^\d+$/.test(c) ? c.padStart(6, "0") : c);
const col = (n: number) => (n < 26 ? String.fromCharCode(65 + n) : `A${String.fromCharCode(65 + n - 26)}`);

async function fill(template: string, rows: Record<string, ExcelJS.CellValue>[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(T(template));
  const ws = wb.worksheets[0];
  rows.forEach((values, i) => {
    const row = ws.getRow(3 + i);
    for (const [c, v] of Object.entries(values)) {
      if (v == null || v === "") continue;
      row.getCell(c).value = v;
    }
    row.commit();
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Tramos de calendario: del alta a la baja en semanas (cada día de la semana sale una sola vez por fila). */
function calendarRows(l: Llamamiento) {
  const hours = new Map(l.days.map((d) => [d.date, d.hours]));
  const out: { from: string; to: string; byWeekday: (number | null)[] }[] = [];
  let d = l.alta;
  while (d <= l.baja) {
    const chunk = { from: d, to: d, byWeekday: Array<number | null>(WEEKDAYS).fill(null) };
    for (let i = 0; i < WEEKDAYS && d <= l.baja; i++) {
      chunk.to = d;
      if (hours.has(d)) chunk.byWeekday[weekday(d)] = hours.get(d)!;
      d = addDays(d, 1);
    }
    out.push(chunk);
  }
  return out;
}

/** Los 4 Excel de A3, en el orden en que se importan (con los mismos valores que pone A3 al exportarlos). */
export async function nominaWorkbooks(list: Llamamiento[]) {
  const [a3, cfg] = await Promise.all([getA3(), getA3Alta()]);
  const head = (l: Llamamiento) => ({ A: String(a3.companyCode), B: code6(l.code), C: a3Name(l.w) });
  const contratacion = await fill("a3-contratacion-fechas.xlsx", list.map((l) => ({
    ...head(l), D: "Si", E: "Automática", F: text(l.alta), G: text(l.baja), H: MOTIVO,
  })));
  const contractuales = await fill("a3-datos-contractuales.xlsx", list.map((l) => ({
    ...head(l), D: "Si", E: "Automática", F: CONTRATO, G: "Tipo General", J: text(l.alta), K: text(l.baja),
    L: 2, M: "Meses", N: 15, S: cfg.occupation[l.w.role as Role] ?? cfg.occupation.CAMARERO,
  })));
  // Calendario: un tramo por llamamiento (del alta a la baja), con los días trabajados laborables y sus horas
  const calendario = await fill("a3-plantillas-calendario.xlsx", list.flatMap((l) => calendarRows(l).map((c) => {
    const row: Record<string, ExcelJS.CellValue> = { ...head(l), D: "No", E: text(c.from), F: text(c.to), G: "Jornada parcial" };
    c.byWeekday.forEach((h, i) => {
      row[col(7 + i)] = h != null ? "Laborable" : "Vacío"; // H…N
      row[col(14 + i)] = h ?? 0; // O…U
    });
    return row;
  })));
  // Ajuste salarial: el líquido pactado, con las mismas marcas que tienen en A3 (vacaciones, cotización e IRPF)
  const flags: Record<string, string> = { I: "Si", N: "Si", O: "Si", P: "Si" };
  for (let i = 16; i <= 27; i++) flags[col(i)] = "No"; // Q…AB
  const ajuste = await fill("a3-ajuste-salarial.xlsx", list.map((l) => ({
    ...head(l), D: "Si", E: "Automática", F: "Líquido", G: l.net, H: `${cfg.adjustConcept || "22"}=100,00%`, ...flags,
  })));
  return [
    { name: "1_contratacion_fechas.xlsx", label: "Contratación-Fechas", data: contratacion },
    { name: "2_datos_contractuales.xlsx", label: "Datos Contractuales", data: contractuales },
    { name: "3_plantillas_calendario.xlsx", label: "Plantillas Calendario", data: calendario },
    { name: "4_ajuste_salarial.xlsx", label: "Ajuste Salarial", data: ajuste },
  ];
}

export const monthBounds = (month: string) => monthRange(`${month}-01`);
