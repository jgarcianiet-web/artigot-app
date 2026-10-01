import { db } from "./db";
import { addDays } from "./domain";
import { payrollLines } from "./payroll";

/**
 * Pagos por quincena vencida: del 1 al 15 se paga el día 22 del mismo mes y del 16 al último día,
 * la primera semana del mes siguiente. RRHH puede cambiar la fecha de cada quincena, y el
 * personal la ve en su app.
 *
 * El neto que ve el trabajador es una estimación: bruto − Seguridad Social del trabajador − IRPF.
 * RRHH puede poner (o importar desde A3) el neto real de cada persona antes de generar la remesa.
 */

export type PaySettings = {
  /** % de cotización a cargo del trabajador (contingencias comunes, desempleo, FP y MEI) */
  ssPct: number;
  /** % de IRPF para el neto estimado (el real lo da la nómina de A3) */
  irpfPct: number;
  /** Las tarifas ya son el importe que cobra el trabajador: no se descuenta nada */
  ratesAreNet: boolean;
  /** Día de pago de la primera quincena (del mismo mes) */
  firstHalfDay: number;
  /** Día de pago de la segunda quincena (del mes siguiente) */
  secondHalfDay: number;
  /** Cuenta de la empresa desde la que se paga */
  debtorIban: string;
  debtorBic: string;
  /** Sufijo del ordenante que da el banco (3 caracteres, normalmente 000) */
  sepaSuffix: string;
};

export const PAY_DEFAULTS: PaySettings = {
  // 2026, contrato temporal: 4,70 CC + 1,60 desempleo + 0,10 FP + 0,15 MEI
  ssPct: 6.55,
  // Mínimo legal para contratos de duración inferior a un año
  irpfPct: 2,
  ratesAreNet: false,
  firstHalfDay: 22,
  secondHalfDay: 7,
  debtorIban: "",
  debtorBic: "",
  sepaSuffix: "000",
};

export async function getPaySettings(): Promise<PaySettings> {
  const row = await db.setting.findUnique({ where: { key: "pagos" } });
  const v = (row?.value ?? {}) as Partial<PaySettings>;
  return { ...PAY_DEFAULTS, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined && x !== "")) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Porcentajes que se descuentan de verdad (ninguno si las tarifas ya son netas). */
export const deductions = (s: Pick<PaySettings, "ssPct" | "irpfPct" | "ratesAreNet">) =>
  s.ratesAreNet ? { ssPct: 0, irpfPct: 0 } : { ssPct: s.ssPct, irpfPct: s.irpfPct };

export function netOf(gross: number, ssPct: number, irpfPct: number) {
  const ss = round2((gross * ssPct) / 100);
  const irpf = round2((gross * irpfPct) / 100);
  return { ss, irpf, net: round2(gross - ss - irpf) };
}

// ---------- Quincenas ----------

export type Half = { key: string; from: string; to: string; half: 1 | 2 };

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Clave «2026-09-1» / «2026-09-2» → fechas de la quincena. */
export function halfFromKey(key: string): Half | null {
  const m = key.match(/^(\d{4}-(0[1-9]|1[0-2]))-([12])$/);
  if (!m) return null;
  const half = Number(m[3]) as 1 | 2;
  const month = m[1];
  return half === 1
    ? { key, from: `${month}-01`, to: `${month}-15`, half }
    : { key, from: `${month}-16`, to: `${month}-${lastDay(month)}`, half };
}

export function halfOf(date: string): Half {
  return halfFromKey(`${date.slice(0, 7)}-${Number(date.slice(8, 10)) <= 15 ? 1 : 2}`)!;
}

export function shiftHalf(h: Half, n: number): Half {
  let [y, m] = h.key.slice(0, 7).split("-").map(Number);
  let half = h.half - 1 + n; // 0-based
  m += Math.floor(half / 2);
  half = ((half % 2) + 2) % 2;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return halfFromKey(`${y}-${String(m).padStart(2, "0")}-${half + 1}`)!;
}

/** Si cae en fin de semana, pasa al lunes. */
function weekday(date: string) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dow === 6 ? addDays(date, 2) : dow === 0 ? addDays(date, 1) : date;
}

export function defaultPayDate(h: Half, s: Pick<PaySettings, "firstHalfDay" | "secondHalfDay">) {
  const month = h.from.slice(0, 7);
  if (h.half === 1) return weekday(`${month}-${String(Math.min(s.firstHalfDay, lastDay(month))).padStart(2, "0")}`);
  const next = addDays(`${month}-${lastDay(month)}`, 1).slice(0, 7);
  return weekday(`${next}-${String(Math.min(s.secondHalfDay, lastDay(next))).padStart(2, "0")}`);
}

export const halfLabel = (h: Half) => {
  const month = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${h.from}T12:00:00Z`));
  return `${Number(h.from.slice(8))}–${Number(h.to.slice(8))} ${month}`;
};

// ---------- Líneas de pago ----------

export type PayRow = {
  workerId: string;
  name: string;
  dni: string | null;
  a3Code: string | null;
  iban: string | null;
  services: number;
  hours: number;
  gross: number;
  ss: number;
  irpf: number;
  irpfPct: number;
  netEstimate: number;
  net: number;
  /** Neto puesto o importado por RRHH (el de la nómina real) */
  final: boolean;
  /** Servicios sin horas cerradas */
  pending: number;
};

/** Importes en vivo a partir de los servicios confirmados de la quincena. */
async function liveRows(h: Half, s: PaySettings, workerId?: string): Promise<Omit<PayRow, "net" | "final">[]> {
  const lines = (await payrollLines(h.from, h.to)).filter((l) => !workerId || l.a.workerId === workerId);
  const pct = deductions(s);
  const by = new Map<string, Omit<PayRow, "net" | "final">>();
  for (const l of lines) {
    const w = l.a.worker;
    const r = by.get(w.id) ?? {
      workerId: w.id, name: w.name, dni: w.dni, a3Code: w.a3Code, iban: w.iban,
      services: 0, hours: 0, gross: 0, ss: 0, irpf: 0, irpfPct: pct.irpfPct, netEstimate: 0, pending: 0,
    };
    r.services++;
    r.hours += l.billedHours ?? 0;
    r.gross = round2(r.gross + l.amount);
    if (l.hours == null) r.pending++;
    by.set(w.id, r);
  }
  return [...by.values()].map((r) => {
    const n = netOf(r.gross, pct.ssPct, r.irpfPct);
    return { ...r, hours: round2(r.hours), ss: n.ss, irpf: n.irpf, netEstimate: n.net };
  });
}

/** Quincena tal y como está: en vivo si está abierta, o congelada si ya se cerró. */
export async function payPeriod(h: Half, opts: { workerId?: string } = {}) {
  const s = await getPaySettings();
  const period = await db.payPeriod.findUnique({
    where: { from_to: { from: h.from, to: h.to } },
    include: {
      lines: { where: opts.workerId ? { workerId: opts.workerId } : {}, include: { worker: { select: { name: true, dni: true, a3Code: true, iban: true } } } },
      remittances: { orderBy: { createdAt: "desc" }, select: { id: true, count: true, total: true, execDate: true, createdAt: true, createdBy: true } },
    },
  });
  const status = period?.status ?? "ABIERTA";
  const payDate = period?.payDate ?? defaultPayDate(h, s);
  let rows: PayRow[];
  if (status === "ABIERTA") {
    const overrides = new Map((period?.lines ?? []).map((l) => [l.workerId, l.netOverride]));
    rows = (await liveRows(h, s, opts.workerId)).map((r) => {
      const o = overrides.get(r.workerId);
      return { ...r, net: o ?? r.netEstimate, final: o != null };
    });
  } else {
    rows = period!.lines.map((l) => ({
      workerId: l.workerId, name: l.worker.name, dni: l.worker.dni, a3Code: l.worker.a3Code, iban: l.iban,
      services: l.services, hours: l.hours, gross: l.gross, ss: l.ss, irpf: l.irpf,
      irpfPct: l.gross ? round2((l.irpf / l.gross) * 100) : 0,
      netEstimate: l.netEstimate, net: l.netOverride ?? l.netEstimate, final: l.netOverride != null, pending: 0,
    }));
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { half: h, period, status, payDate, payDateIsDefault: !period, settings: s, rows, remittances: period?.remittances ?? [] };
}

/** Congela los importes de la quincena (se hace al generar la remesa). */
export async function closePeriod(h: Half, by: string) {
  const s = await getPaySettings();
  const payDate = (await db.payPeriod.findUnique({ where: { from_to: { from: h.from, to: h.to } } }))?.payDate ?? defaultPayDate(h, s);
  const period = await db.payPeriod.upsert({
    where: { from_to: { from: h.from, to: h.to } },
    create: { from: h.from, to: h.to, payDate, updatedBy: by },
    update: {},
  });
  if (period.status !== "ABIERTA") return period;
  const rows = await liveRows(h, s);
  const overrides = new Map((await db.payLine.findMany({ where: { periodId: period.id } })).map((l) => [l.workerId, l.netOverride]));
  await db.$transaction([
    db.payLine.deleteMany({ where: { periodId: period.id, workerId: { notIn: rows.map((r) => r.workerId) } } }),
    ...rows.map((r) => {
      const data = { services: r.services, hours: r.hours, gross: r.gross, ss: r.ss, irpf: r.irpf, netEstimate: r.netEstimate, iban: r.iban, netOverride: overrides.get(r.workerId) ?? null };
      return db.payLine.upsert({ where: { periodId_workerId: { periodId: period.id, workerId: r.workerId } }, create: { periodId: period.id, workerId: r.workerId, ...data }, update: data });
    }),
    db.payPeriod.update({ where: { id: period.id }, data: { status: "CERRADA", closedAt: new Date(), updatedBy: by } }),
  ]);
  return db.payPeriod.findUniqueOrThrow({ where: { id: period.id } });
}
