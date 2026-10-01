import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { db } from "./db";
import { callTime, euro, formatDate, hoursBetween, isLeadRole, payable, rateFor, ROLES, workedHours, type Role } from "./domain";
import { getCompany } from "./contracts";

/**
 * Presupuesto de personal de cada evento frente a lo que ha costado de verdad (fichajes).
 * Presupuesto: el que pone RRHH o, si no hay, el calculado con el personal necesario, las tarifas
 * y el horario previsto (citación → fin, con el mínimo de horas). Gasto: las horas fichadas o
 * corregidas del personal confirmado por su tarifa. Desviación = gasto − presupuesto.
 */

type Rate = Parameters<typeof rateFor>[0][number];
type EventForBudget = {
  type: string;
  startTime: string;
  endTime: string | null;
  unloadTime: string | null;
  needCamareros: number;
  needMaitres: number;
  needResponsables: number;
  needMozos: number;
};

const NEED: Record<Role, keyof EventForBudget> = { CAMARERO: "needCamareros", MAITRE: "needMaitres", RESPONSABLE: "needResponsables", MOZO: "needMozos" };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Presupuesto calculado: personal necesario × tarifa × horas previstas (o el mínimo). */
export function estimateBudget(event: EventForBudget, rates: Rate[]) {
  let total = 0;
  for (const role of ROLES) {
    const count = Number(event[NEED[role]]) || 0;
    if (!count) continue;
    const hours = hoursBetween(callTime(event, role), event.endTime);
    total += count * payable(hours, rateFor(rates, role, event.type)).amount;
  }
  return round2(total);
}

export type BudgetRow = {
  id: string;
  date: string;
  name: string;
  client: string | null;
  salesRep: string | null;
  lead: string | null;
  budget: number;
  estimated: boolean;
  cost: number;
  /** Confirmados sin horas: el gasto aún no es definitivo */
  pending: number;
  done: boolean;
  deviation: number | null;
  pct: number | null;
  note: string | null;
};

export async function budgetRows(filter: { from?: string; to?: string; salesRep?: string; eventId?: string }) {
  const [events, rates] = await Promise.all([
    db.event.findMany({
      where: {
        ...(filter.eventId ? { id: filter.eventId } : { date: { gte: filter.from, lte: filter.to } }),
        ...(filter.salesRep && { salesRep: filter.salesRep === "-" ? null : filter.salesRep }),
      },
      include: { assignments: { where: { status: "CONFIRMADO" }, include: { worker: { select: { name: true, customRates: true } } } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.rate.findMany(),
  ]);
  return events.map((e): BudgetRow => {
    let cost = 0;
    let pending = 0;
    for (const a of e.assignments) {
      const h = workedHours(a);
      if (h == null) pending++;
      cost += payable(h, rateFor(rates, a.role, e.type, a.worker.customRates)).amount;
    }
    cost = round2(cost);
    const estimated = e.budget == null;
    const budget = e.budget ?? estimateBudget(e, rates);
    const done = e.assignments.length > 0 && pending === 0;
    const deviation = done ? round2(cost - budget) : null;
    return {
      id: e.id,
      date: e.date,
      name: e.name,
      client: e.client,
      salesRep: e.salesRep,
      lead: e.assignments.filter((a) => isLeadRole(a.role)).map((a) => a.worker.name).join(", ") || null,
      budget,
      estimated,
      cost,
      pending,
      done,
      deviation,
      pct: deviation != null && budget > 0 ? round2((cost / budget - 1) * 100) : null,
      note: e.budgetNote,
    };
  });
}

export function totals(rows: BudgetRow[]) {
  const done = rows.filter((r) => r.done);
  const budget = round2(done.reduce((s, r) => s + r.budget, 0));
  const cost = round2(done.reduce((s, r) => s + r.cost, 0));
  return { events: rows.length, done: done.length, budget, cost, deviation: round2(cost - budget), pct: budget > 0 ? round2((cost / budget - 1) * 100) : null };
}

/** Totales por comercial. */
export function bySalesRep(rows: BudgetRow[]) {
  const groups = new Map<string, BudgetRow[]>();
  for (const r of rows) groups.set(r.salesRep ?? "", [...(groups.get(r.salesRep ?? "") ?? []), r]);
  return [...groups.entries()].map(([rep, rs]) => ({ rep, ...totals(rs) })).sort((a, b) => a.rep.localeCompare(b.rep, "es"));
}

export async function salesReps() {
  const rows = await db.event.findMany({ where: { salesRep: { not: null } }, distinct: ["salesRep"], select: { salesRep: true }, orderBy: { salesRep: "asc" } });
  return rows.map((r) => r.salesRep!);
}

export const pctText = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`);

// ---------- PDF ----------

const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€–—…]/g, "");

function fit(text: string, font: PDFFont, size: number, width: number) {
  let t = safe(text);
  while (t && font.widthOfTextAtSize(t, size) > width) t = t.slice(0, -2) + "…";
  return t;
}

/** Informe en PDF (A4 apaisado): una fila por evento y totales por comercial. */
export async function budgetPdf(rows: BudgetRow[], title: string, subtitle: string) {
  const company = await getCompany();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36;
  const cols = [
    { h: "Fecha", w: 58 }, { h: "Evento / cliente", w: 190 }, { h: "Comercial", w: 82 }, { h: "Maître", w: 92 },
    { h: "Presupuesto", w: 70, r: true }, { h: "Gasto", w: 66, r: true }, { h: "Desviación", w: 66, r: true }, { h: "%", w: 46, r: true }, { h: "Comentario", w: 100 },
  ];
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const header = () => {
    page.drawText(safe(company.name || "Artigot"), { x: M, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 20;
    page.drawText(safe(title), { x: M, y, size: 15, font: bold });
    y -= 15;
    page.drawText(safe(subtitle), { x: M, y, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
    y -= 22;
    let x = M;
    for (const c of cols) {
      const tw = bold.widthOfTextAtSize(c.h, 8);
      page.drawText(c.h, { x: c.r ? x + c.w - tw - 4 : x, y, size: 8, font: bold });
      x += c.w;
    }
    y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7 });
    y -= 12;
  };
  const row = (cells: string[], opts: { bold?: boolean; color?: (i: number) => ReturnType<typeof rgb> | undefined } = {}) => {
    if (y < M + 20) {
      page = pdf.addPage([W, H]);
      y = H - M;
      header();
    }
    let x = M;
    cols.forEach((c, i) => {
      const f = opts.bold ? bold : font;
      const t = fit(cells[i] ?? "", f, 8, c.w - 6);
      const tw = f.widthOfTextAtSize(t, 8);
      page.drawText(t, { x: c.r ? x + c.w - tw - 4 : x, y, size: 8, font: f, color: opts.color?.(i) });
      x += c.w;
    });
    y -= 13;
  };
  const red = rgb(0.75, 0.1, 0.1), green = rgb(0.05, 0.5, 0.25);
  const devColor = (d: number | null) => (i: number) => (i >= 6 && i <= 7 && d != null ? (d > 0 ? red : d < 0 ? green : undefined) : undefined);
  header();
  for (const r of rows) {
    row(
      [
        formatDate(r.date).replace(/\./g, ""),
        `${r.name}${r.client ? ` · ${r.client}` : ""}`,
        r.salesRep ?? "—",
        r.lead ?? "—",
        `${euro(r.budget)}${r.estimated ? "*" : ""}`,
        r.done ? euro(r.cost) : r.pending ? `${euro(r.cost)} (${r.pending} sin horas)` : "—",
        r.deviation == null ? "—" : `${r.deviation > 0 ? "+" : ""}${euro(r.deviation)}`,
        pctText(r.pct),
        r.note ?? "",
      ],
      { color: devColor(r.deviation) },
    );
  }
  y -= 4;
  page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.5 });
  const groups = bySalesRep(rows);
  if (groups.length > 1) {
    for (const g of groups) row(["", `Comercial: ${g.rep || "sin comercial"} (${g.done} de ${g.events} eventos cerrados)`, "", "", euro(g.budget), euro(g.cost), `${g.deviation > 0 ? "+" : ""}${euro(g.deviation)}`, pctText(g.pct), ""], { color: devColor(g.deviation) });
  }
  const t = totals(rows);
  row(["", `Total (${t.done} de ${t.events} eventos con todas las horas)`, "", "", euro(t.budget), euro(t.cost), `${t.deviation > 0 ? "+" : ""}${euro(t.deviation)}`, pctText(t.pct), ""], { bold: true, color: devColor(t.deviation) });
  y -= 8;
  if (y > M) page.drawText("* Presupuesto calculado con el personal necesario, las tarifas y el horario previsto. Desviación positiva = por encima del presupuesto.", { x: M, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  return Buffer.from(await pdf.save());
}
