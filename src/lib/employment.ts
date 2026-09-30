import { phoneKey } from "./auth";
import { db } from "./db";
import { addDays, isRole, type Role } from "./domain";
import { norm, parseRole, readTable } from "./importStaff";
import { validDniNie } from "./staff";

/**
 * Altas y bajas en la Seguridad Social: sustituye al Excel que lleva RRHH.
 * Cada registro es un periodo de alta de un trabajador (fecha de alta y, cuando la hay, de baja),
 * con el tipo de contrato y si ya se ha comunicado a la Seguridad Social (Sistema RED).
 */

export { CONTRACT_TYPES, END_REASONS } from "./employmentTypes";
import { CONTRACT_TYPES } from "./employmentTypes";

type EmploymentLike = { startDate: string; endDate: string | null };

/** ¿Está de alta ese día? */
export const covers = (e: EmploymentLike, date: string) => e.startDate <= date && (!e.endDate || e.endDate >= date);

/** Personal confirmado en los próximos días que no tiene alta ese día. */
export async function missingAltas(from: string, days: number) {
  const assignments = await db.assignment.findMany({
    where: { status: "CONFIRMADO", event: { date: { gte: from, lte: addDays(from, days) }, status: { not: "CANCELADO" } } },
    include: { event: { select: { id: true, name: true, date: true } }, worker: { select: { id: true, name: true, employments: { select: { startDate: true, endDate: true } } } } },
    orderBy: { event: { date: "asc" } },
  });
  return assignments.filter((a) => !a.worker.employments.some((e) => covers(e, a.event.date)));
}

/** Movimientos sin comunicar todavía a la Seguridad Social. */
export async function unreported() {
  const [altas, bajas] = await Promise.all([
    db.employment.count({ where: { startReported: false } }),
    db.employment.count({ where: { endDate: { not: null }, endReported: false } }),
  ]);
  return { altas, bajas };
}

// ---------- Importación del Excel de altas y bajas ----------

type Field = "name" | "surname" | "dni" | "nss" | "phone" | "start" | "end" | "contract" | "category" | "hours" | "reason" | "notes";

function fieldFor(header: string): Field | null {
  const h = norm(header);
  if (!h) return null;
  if (/\b(fecha )?(de )?baja\b/.test(h) && !/motivo|causa/.test(h)) return "end";
  if (/\b(motivo|causa)\b/.test(h)) return "reason";
  if (/\b(fecha )?(de )?(alta|inicio|entrada)\b/.test(h)) return "start";
  if (/\b(fecha fin|fin contrato|fin|salida)\b/.test(h)) return "end";
  if (/\b(dni|nie|nif|documento)\b/.test(h)) return "dni";
  if (/\b(nss|naf|afiliacion|seguridad social|n ss|num ss)\b/.test(h)) return "nss";
  if (/\b(telefono|movil|tlf|telf)\b/.test(h)) return "phone";
  if (/\b(tipo de contrato|tipo contrato|contrato|modalidad)\b/.test(h)) return "contract";
  if (/\b(categoria|puesto|grupo)\b/.test(h)) return "category";
  if (/\b(horas|jornada)\b/.test(h)) return "hours";
  if (/\b(observaciones|notas|comentarios|obs)\b/.test(h)) return "notes";
  if (/\bapellido/.test(h)) return "surname";
  if (/\b(nombre|trabajador|empleado)\b/.test(h)) return "name";
  return null;
}

/** Fecha en cualquiera de los formatos habituales de Excel → YYYY-MM-DD. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function iso(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function parseContract(v: string): string {
  const s = norm(v);
  if (!s) return CONTRACT_TYPES[0];
  if (/discontinu/.test(s)) return "Fijo discontinuo";
  if (/(eventual|circunstanc|produccion|obra|temporal|^40[12]|^50[12])/.test(s) && !/sustitu|interin/.test(s)) return "Eventual (circunstancias de la producción)";
  if (/(sustitu|interin)/.test(s)) return "Temporal por sustitución";
  if (/(indefinid|fijo|^100|^189|^200)/.test(s)) return "Indefinido";
  return "Otro";
}

export type EmploymentImportRow = {
  line: number;
  name: string;
  dni: string | null;
  workerId: string | null;
  workerName?: string;
  createWorker?: { phone: string; role: Role; nss: string | null };
  startDate: string | null;
  endDate: string | null;
  contractType: string;
  category: string | null;
  hoursPerWeek: number | null;
  endReason: string | null;
  notes: string | null;
  status: "nuevo" | "actualizar" | "error";
  message?: string;
};

export async function analyzeEmployments(file: File): Promise<{ rows: EmploymentImportRow[]; columns: { header: string; field: Field | null }[] } | { error: string }> {
  const table = await readTable(file);
  if ("error" in table) return table;
  let headerIdx = -1;
  let fields: (Field | null)[] = [];
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const f = table[i].map(fieldFor);
    if (f.includes("start") && (f.includes("name") || f.includes("dni") || f.includes("surname"))) {
      headerIdx = i;
      fields = f;
      break;
    }
  }
  if (headerIdx < 0) return { error: "No encuentro las columnas. La primera fila debe tener cabeceras como «Nombre», «DNI», «Fecha alta» y «Fecha baja»." };
  const col = (row: string[], f: Field) => fields.map((x, i) => (x === f ? row[i] ?? "" : "")).filter(Boolean).join(" ").trim();

  const workers = await db.worker.findMany({ select: { id: true, name: true, dni: true, phoneKey: true, employments: { select: { startDate: true } } } });
  const byDni = new Map(workers.filter((w) => w.dni).map((w) => [w.dni!, w]));
  const byPhone = new Map(workers.map((w) => [w.phoneKey, w]));
  const byName = new Map<string, (typeof workers)[number] | null>();
  for (const w of workers) byName.set(norm(w.name), byName.has(norm(w.name)) ? null : w); // null = nombre repetido
  const seen = new Set<string>();

  const rows: EmploymentImportRow[] = [];
  table.slice(headerIdx + 1).forEach((row, i) => {
    if (!row.some((c) => c.trim())) return;
    const name = [col(row, "name"), col(row, "surname")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const dniRaw = col(row, "dni").toUpperCase().replace(/[\s.-]/g, "");
    const dni = dniRaw || null;
    const phone = col(row, "phone");
    const startRaw = col(row, "start");
    const endRaw = col(row, "end");
    const hours = Number(col(row, "hours").replace(",", "."));
    const r: EmploymentImportRow = {
      line: headerIdx + i + 2,
      name,
      dni,
      workerId: null,
      startDate: parseDate(startRaw),
      endDate: parseDate(endRaw),
      contractType: parseContract(col(row, "contract")),
      category: col(row, "category") || null,
      hoursPerWeek: Number.isFinite(hours) && hours > 0 ? hours : null,
      endReason: col(row, "reason") || null,
      notes: col(row, "notes") || null,
      status: "nuevo",
    };
    const w =
      (dni && byDni.get(dni)) ||
      (phone && phoneKey(phone).length >= 9 && byPhone.get(phoneKey(phone))) ||
      (name && byName.get(norm(name))) ||
      null;
    if (w) {
      r.workerId = w.id;
      r.workerName = w.name;
    }
    const fail = (message: string) => rows.push({ ...r, status: "error", message });
    if (!r.startDate) return fail(startRaw ? `Fecha de alta no válida: «${startRaw}»` : "Falta la fecha de alta");
    if (endRaw && !r.endDate) return fail(`Fecha de baja no válida: «${endRaw}»`);
    if (r.endDate && r.endDate < r.startDate) return fail("La baja es anterior al alta");
    if (dni && !validDniNie(dni)) return fail(`DNI/NIE no válido: ${dni}`);
    if (!w) {
      if (!name || phoneKey(phone).length < 9) return fail("No está en Personal. Añade su teléfono en el Excel para darle de alta, o créalo antes en Personal.");
      const role = parseRole(r.category ?? "");
      r.createWorker = { phone, role: role && isRole(role) ? role : "CAMARERO", nss: col(row, "nss").replace(/\D/g, "") || null };
    }
    const key = `${w?.id ?? name}|${r.startDate}`;
    if (seen.has(key)) return fail("Fila repetida en el archivo");
    seen.add(key);
    if (w?.employments.some((e) => e.startDate === r.startDate)) {
      r.status = "actualizar";
      r.message = "Ya existe esa alta: se actualizará";
    }
    rows.push(r);
  });
  return { rows, columns: table[headerIdx].map((header, i) => ({ header, field: fields[i] })) };
}
