import path from "node:path";
import ExcelJS from "exceljs";
import { db } from "./db";
import { EXTRA_WHERE, type Role } from "./domain";

/**
 * Alta masiva de trabajadores en A3 (plantilla «Formato Alta masiva de trabajadores (Avanzada)»).
 * Se rellena la misma plantilla que exporta A3, con los datos de cada trabajador y los valores
 * fijos de la empresa (convenio, categoría, contrato…) que se configuran en Ajustes → Nóminas A3.
 */

export type A3AltaConfig = {
  center: string;
  agreement: string;
  category: string;
  position: string;
  regime: string;
  tariffGroup: string;
  paymentType: string;
  contractType: string;
  contributionType: string;
  grossType: string;
  /** Ocupación (CNO) por puesto */
  occupation: Record<Role, string>;
  education: string;
  nationality: string;
  /** Último código de trabajador usado en A3 (el siguiente alta lleva el siguiente) */
  lastCode: number;
  /** Bajas (formato «MB - Baja»): motivo e inactividad */
  bajaReason: string;
  bajaInactivity: string;
};

// Los valores de la exportación de A3 que nos pasó RRHH
export const A3_ALTA_DEFAULTS: A3AltaConfig = {
  center: "1",
  agreement: "28002085011981",
  category: "2",
  position: "36",
  regime: "Régimen General",
  tariffGroup: "08 - Oficiales de Primera y Segunda",
  paymentType: "Mensual",
  contractType: "300 - PARA LA REALIZACION DE TRABAJOS FIJO DISCONTINUOS",
  contributionType: "Tipo General",
  grossType: "Indicar texto",
  occupation: {
    CAMARERO: "5120 - CAMAREROS ASALARIADOS",
    RESPONSABLE: "5120 - CAMAREROS ASALARIADOS",
    MAITRE: "5120 - CAMAREROS ASALARIADOS",
    MOZO: "8412 - CONDUCTORES ASALARIADOS DE AUTOMÓVILES, TAXIS Y FURGONETAS",
  },
  education: "Enseñanzas de bachillerato",
  nationality: "ESPAÑA",
  lastCode: 0,
  bajaReason: "Baja por pase a inactividad fijos discontinuos",
  bajaInactivity: "",
};

export async function getA3Alta(): Promise<A3AltaConfig> {
  const row = await db.setting.findUnique({ where: { key: "a3alta" } });
  const v = (row?.value ?? {}) as Partial<A3AltaConfig>;
  return { ...A3_ALTA_DEFAULTS, ...v, occupation: { ...A3_ALTA_DEFAULTS.occupation, ...(v.occupation ?? {}) } };
}

export async function saveA3Alta(value: A3AltaConfig) {
  await db.setting.upsert({ where: { key: "a3alta" }, create: { key: "a3alta", value }, update: { value } });
}

/** Sube el último código usado si el nuevo es mayor. */
export async function bumpLastCode(code: number) {
  const cfg = await getA3Alta();
  if (Number.isFinite(code) && code > cfg.lastCode) await saveA3Alta({ ...cfg, lastCode: code });
}

/** Siguiente código libre: el mayor entre el guardado y los del personal de la app, más uno. */
export async function nextA3Code() {
  const cfg = await getA3Alta();
  const codes = await db.worker.findMany({ where: { a3Code: { not: null } }, select: { a3Code: true } });
  const max = codes.reduce((m, w) => Math.max(m, /^\d+$/.test(w.a3Code!) ? Number(w.a3Code) : 0), cfg.lastCode);
  return max + 1;
}

// ---------- Listas de la plantilla ----------

export const TEMPLATE = path.join(process.cwd(), "templates", "a3-alta-masiva.xlsx");

type Lists = { countries: string[]; education: string[]; contracts: string[]; occupations: string[]; tariffGroups: string[]; regimes: string[]; contributions: string[] };
let lists: Promise<Lists> | null = null;

/** Valores admitidos por A3 (hoja oculta de la plantilla). */
export function templateLists() {
  lists ??= (async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(TEMPLATE);
    const ws = wb.getWorksheet("Oculta")!;
    const col = (name: string) => {
      const header = ws.getRow(2).values as unknown[];
      const idx = header.findIndex((v) => v === name);
      const out: string[] = [];
      if (idx < 0) return out;
      for (let r = 3; r <= ws.rowCount; r++) {
        const v = ws.getRow(r).getCell(idx).value;
        if (v != null && String(v).trim()) out.push(String(v));
      }
      return out;
    };
    return {
      countries: col("RangeCountries"),
      education: col("RangeEducationLeveID"),
      contracts: col("RangeContractType"),
      occupations: col("RangeOccupationID"),
      tariffGroups: col("RangeGrupoTarifa"),
      regimes: col("RangeCompanyRegimes"),
      contributions: col("RangeContributionType"),
    };
  })();
  return lists;
}

// ---------- Datos de cada trabajador ----------

/** Mayúsculas sin tildes (la Ñ se mantiene), como escribe A3 los nombres. */
const upper = (s: string) =>
  s
    .toLocaleUpperCase("es-ES")
    .replace(/Ñ/g, "\u0000")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0000/g, "Ñ")
    .replace(/\s+/g, " ")
    .trim();

// «de», «la», «del»… van con el apellido que les sigue: «DE LA FUENTE»
const PARTICLES = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "SAN", "SANTA", "VAN", "VON", "DA", "DOS"]);
function groups(tokens: string[]) {
  const out: string[] = [];
  let pending: string[] = [];
  for (const t of tokens) {
    if (PARTICLES.has(t)) pending.push(t);
    else {
      out.push([...pending, t].join(" "));
      pending = [];
    }
  }
  if (pending.length) out.push(pending.join(" "));
  return out;
}

/** Nombre y apellidos: los de la ficha o, si faltan, separados del nombre completo. */
export function splitName(w: { name: string; firstName?: string | null; surname1?: string | null; surname2?: string | null }) {
  if (w.firstName?.trim() && w.surname1?.trim()) {
    return { first: upper(w.firstName), s1: upper(w.surname1), s2: upper(w.surname2 ?? ""), guessed: false };
  }
  // «APELLIDOS, NOMBRE» (como en la base de datos de A3)
  const comma = w.name.split(",");
  if (comma.length === 2 && comma[1].trim()) {
    const [s1, ...rest] = upper(comma[0]).split(" ");
    return { first: upper(comma[1]), s1, s2: rest.join(" "), guessed: true };
  }
  const t = groups(upper(w.name).split(" "));
  if (t.length >= 3) return { first: t.slice(0, -2).join(" "), s1: t.at(-2)!, s2: t.at(-1)!, guessed: true };
  if (t.length === 2) return { first: t[0], s1: t[1], s2: "", guessed: true };
  return { first: t[0] ?? "", s1: "", s2: "", guessed: true };
}

export const docType = (dni: string | null | undefined) => (/^[XYZ]/i.test((dni ?? "").trim()) ? "NIE" : "DNI / NIF");

/** NAF en el formato de A3: 28/16927162/20. */
export function formatNaf(nss: string | null | undefined) {
  const d = (nss ?? "").replace(/\D/g, "");
  if (d.length === 12) return `${d.slice(0, 2)}/${d.slice(2, 10)}/${d.slice(10)}`;
  if (d.length === 11) return `${d.slice(0, 2)}/0${d.slice(2, 9)}/${d.slice(9)}`;
  return (nss ?? "").trim();
}

/** Entidad, oficina, DC y cuenta de un IBAN español. */
export function bankParts(iban: string | null | undefined) {
  const i = (iban ?? "").toUpperCase().replace(/\s/g, "");
  if (!/^ES\d{22}$/.test(i)) return null;
  return { bank: i.slice(4, 8), branch: i.slice(8, 12), dc: i.slice(12, 14), account: i.slice(14) };
}

const date = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null);

export type AltaRow = {
  code: string;
  startDate: string;
  worker: {
    name: string;
    firstName: string | null;
    surname1: string | null;
    surname2: string | null;
    dni: string | null;
    nss: string | null;
    sex: string | null;
    birthDate: string | null;
    nationality: string | null;
    education: string | null;
    email: string | null;
    iban: string | null;
    role: string;
    a3Center: string | null;
  };
};

/** Lo que falta para que A3 acepte el alta. */
export function altaProblems(w: AltaRow["worker"]) {
  const p: string[] = [];
  if (!w.dni) p.push("DNI/NIE");
  if (!w.nss) p.push("Nº Seguridad Social");
  if (!w.sex) p.push("sexo");
  if (!w.birthDate) p.push("fecha de nacimiento");
  if (!bankParts(w.iban)) p.push("IBAN");
  return p;
}

/** Rellena la plantilla de A3 con una fila por alta. */
export async function buildAltaWorkbook(rows: AltaRow[], companyCode: string, cfg: A3AltaConfig) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.worksheets[0];
  rows.forEach((r, i) => {
    const w = r.worker;
    const n = splitName(w);
    const bank = bankParts(w.iban);
    const start = date(r.startDate);
    const values: Record<string, ExcelJS.CellValue> = {
      A: /^\d+$/.test(companyCode) ? Number(companyCode) : companyCode,
      B: w.a3Center || cfg.center,
      C: r.code,
      D: docType(w.dni),
      E: (w.dni ?? "").toUpperCase().trim(),
      F: n.first,
      G: n.s1,
      H: n.s2 || null,
      I: w.sex,
      J: formatNaf(w.nss),
      K: start,
      L: date(w.birthDate),
      M: w.nationality || cfg.nationality,
      N: null,
      O: cfg.agreement,
      P: cfg.category,
      Q: cfg.position,
      U: cfg.regime,
      V: cfg.tariffGroup,
      W: cfg.paymentType,
      Y: bank?.bank ?? null,
      Z: bank ? Number(bank.branch) : null,
      AA: bank ? Number(bank.dc) : null,
      AB: bank ? Number(bank.account) : null,
      AC: w.iban ? w.iban.toUpperCase().replace(/\s/g, "") : null,
      AE: cfg.contractType,
      AF: cfg.contributionType,
      AG: cfg.grossType,
      AI: cfg.occupation[w.role as Role] ?? cfg.occupation.CAMARERO,
      AJ: w.education || cfg.education,
      AK: start,
      AO: start,
      AP: start,
      AQ: start,
      AR: "No",
    };
    const row = ws.getRow(3 + i);
    for (const [c, v] of Object.entries(values)) {
      const cell = row.getCell(c);
      cell.value = v;
      if (v instanceof Date) cell.numFmt = "dd/mm/yyyy";
    }
    row.commit();
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Personal pendiente de alta en A3 ----------

export const ALTA_SELECT = {
  id: true, name: true, firstName: true, surname1: true, surname2: true, dni: true, nss: true, sex: true, birthDate: true,
  nationality: true, education: true, email: true, iban: true, role: true, a3Center: true,
} as const;

/** Personal activo sin código de A3, con la fecha de su próximo servicio confirmado. */
export async function pendingAltas(from: string) {
  const workers = await db.worker.findMany({
    where: { active: true, a3Code: null, ...EXTRA_WHERE },
    orderBy: { name: "asc" },
    select: {
      ...ALTA_SELECT,
      assignments: { where: { status: "CONFIRMADO", event: { date: { gte: from }, status: { not: "CANCELADO" } } }, select: { event: { select: { date: true } } }, orderBy: { event: { date: "asc" } }, take: 1 },
    },
  });
  return workers.map(({ assignments, ...w }) => ({ worker: w, nextService: assignments[0]?.event.date ?? null }));
}

// ---------- Bajas (formato «MB - Baja» de A3) ----------

export const BAJAS_TEMPLATE = path.join(process.cwd(), "templates", "a3-bajas.xlsx");

let bajaLists: Promise<{ reasons: string[]; inactivity: string[] }> | null = null;
/** Motivos de baja e inactividad que admite A3 (hoja oculta de la plantilla). */
export function bajaTemplateLists() {
  bajaLists ??= (async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(BAJAS_TEMPLATE);
    const ws = wb.getWorksheet("Oculta")!;
    const col = (n: number) => {
      const out: string[] = [];
      for (let r = 3; r <= ws.rowCount; r++) {
        const v = ws.getRow(r).getCell(n).value;
        if (v != null && String(v).trim()) out.push(String(v));
      }
      return out;
    };
    return { reasons: col(1), inactivity: col(2) };
  })();
  return bajaLists;
}

export type BajaRow = { code: string | null; name: string; firstName?: string | null; surname1?: string | null; surname2?: string | null; date: string };

/** «APELLIDOS, NOMBRE» como en A3. */
export const a3Name = (w: Parameters<typeof splitName>[0]) => {
  const n = splitName(w);
  return `${[n.s1, n.s2].filter(Boolean).join(" ")}, ${n.first}`;
};

/** Rellena la plantilla de bajas de A3 con una fila por baja. */
export async function buildBajasWorkbook(rows: BajaRow[], companyCode: string, cfg: A3AltaConfig) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(BAJAS_TEMPLATE);
  const ws = wb.worksheets[0];
  rows.forEach((r, i) => {
    const row = ws.getRow(3 + i);
    row.getCell("A").value = /^\d+$/.test(companyCode) ? Number(companyCode) : companyCode;
    row.getCell("B").value = r.code ?? "";
    row.getCell("C").value = a3Name(r);
    const d = row.getCell("D");
    d.value = new Date(`${r.date}T00:00:00Z`);
    d.numFmt = "dd/mm/yyyy";
    row.getCell("E").value = cfg.bajaReason;
    if (cfg.bajaInactivity) row.getCell("G").value = cfg.bajaInactivity;
    row.commit();
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Altas de quien ya está en A3 (formato «MA - Alta sucesiva») ----------

export const ALTAS_SUCESIVAS_TEMPLATE = path.join(process.cwd(), "templates", "a3-altas-sucesivas.xlsx");

export type AltaSucesivaRow = BajaRow & { role: Role };

/**
 * Rellena la plantilla de altas sucesivas de A3 (un nuevo llamamiento de un fijo discontinuo que ya
 * tiene ficha en A3): una fila por alta con su convenio y su ocupación (CNO) según el puesto.
 * Quien todavía no está en A3 va en el alta masiva.
 */
export async function buildAltasSucesivasWorkbook(rows: AltaSucesivaRow[], companyCode: string, cfg: A3AltaConfig) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ALTAS_SUCESIVAS_TEMPLATE);
  const ws = wb.worksheets[0];
  rows.forEach((r, i) => {
    const row = ws.getRow(3 + i);
    row.getCell("A").value = /^\d+$/.test(companyCode) ? Number(companyCode) : companyCode;
    row.getCell("B").value = r.code ?? "";
    row.getCell("C").value = a3Name(r);
    const d = row.getCell("D");
    d.value = new Date(`${r.date}T00:00:00Z`);
    d.numFmt = "dd/mm/yyyy";
    if (cfg.agreement) row.getCell("P").value = cfg.agreement;
    const cno = cfg.occupation[r.role] ?? cfg.occupation.CAMARERO;
    if (cno) row.getCell("Q").value = cno;
    row.commit();
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
