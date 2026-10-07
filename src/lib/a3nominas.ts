import path from "node:path";
import ExcelJS from "exceljs";
import { getA3 } from "./a3";
import { a3Name, getA3Alta } from "./a3alta";
import { db } from "./db";
import { EXTRA_WHERE } from "./domain";
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
  w: { name: string; firstName: string | null; surname1: string | null; surname2: string | null };
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
      include: { worker: { select: { id: true, name: true, a3Code: true, firstName: true, surname1: true, surname2: true, irpf: true } } },
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

async function fill(template: string, rows: Record<string, ExcelJS.CellValue>[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(T(template));
  const ws = wb.worksheets[0];
  rows.forEach((values, i) => {
    const row = ws.getRow(3 + i);
    for (const [c, v] of Object.entries(values)) {
      if (v == null || v === "") continue;
      const cell = row.getCell(c);
      cell.value = v;
      if (v instanceof Date) cell.numFmt = "dd/mm/yyyy";
    }
    row.commit();
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Los 4 Excel de A3, en el orden en que se importan. */
export async function nominaWorkbooks(list: Llamamiento[]) {
  const [a3, cfg] = await Promise.all([getA3(), getA3Alta()]);
  const company = /^\d+$/.test(a3.companyCode) ? Number(a3.companyCode) : a3.companyCode;
  const head = (l: Llamamiento) => ({ A: company, B: l.code, C: a3Name(l.w) });
  const contratacion = await fill("a3-contratacion-fechas.xlsx", list.map((l) => ({
    ...head(l), D: "Si", E: date(l.alta), F: date(l.alta), G: date(l.baja), H: MOTIVO,
  })));
  const contractuales = await fill("a3-datos-contractuales.xlsx", list.map((l) => ({
    ...head(l), D: "No", E: date(l.alta), F: CONTRATO, G: "Tipo General", J: date(l.alta), K: date(l.baja),
  })));
  // Calendario: una fila por día trabajado, con ese día laborable y sus horas
  const calendario = await fill("a3-plantillas-calendario.xlsx", list.flatMap((l) => l.days.map((d) => {
    const wd = weekday(d.date);
    const row: Record<string, ExcelJS.CellValue> = { ...head(l), D: "No", E: date(d.date), F: date(d.date), G: "Jornada parcial" };
    for (let i = 0; i < WEEKDAYS; i++) {
      row[String.fromCharCode(72 + i)] = i === wd ? "Laborable" : "Vacío"; // H…N
      if (i === wd) row[String.fromCharCode(79 + i)] = d.hours; // O…U
    }
    return row;
  })));
  const ajuste = await fill("a3-ajuste-salarial.xlsx", list.map((l) => ({
    ...head(l), D: "No", E: date(l.alta), F: "Líquido", G: l.net, H: `${cfg.adjustConcept || "22"}=100%`,
  })));
  return [
    { name: "1_contratacion_fechas.xlsx", label: "Contratación-Fechas", data: contratacion },
    { name: "2_datos_contractuales.xlsx", label: "Datos Contractuales", data: contractuales },
    { name: "3_plantillas_calendario.xlsx", label: "Plantillas Calendario", data: calendario },
    { name: "4_ajuste_salarial.xlsx", label: "Ajuste Salarial", data: ajuste },
  ];
}

export const monthBounds = (month: string) => monthRange(`${month}-01`);
