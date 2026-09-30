import { db } from "./db";
import { ROLE_LABEL, ROLES, type Role } from "./domain";
import { payrollLines } from "./payroll";

/**
 * Exportación de variables de nómina para A3 (A3innuva Nómina / A3NOM).
 * Una línea por trabajador y puesto con las horas liquidadas del periodo, su precio e importe,
 * lista para la importación de incidencias/variables desde Excel. Los códigos de empresa,
 * trabajador y concepto son los que tenéis dados de alta en A3.
 */
export type A3Config = {
  companyCode: string;
  hoursConcept: string;
  hoursConceptName: string;
  /** Concepto específico por puesto (opcional); si falta, se usa hoursConcept. */
  roleConcepts: Partial<Record<Role, string>>;
};

export async function getA3(): Promise<A3Config> {
  const row = await db.setting.findUnique({ where: { key: "a3" } });
  const v = (row?.value ?? {}) as Partial<A3Config>;
  return {
    companyCode: v.companyCode ?? "",
    hoursConcept: v.hoursConcept ?? "",
    hoursConceptName: v.hoursConceptName ?? "Horas eventos",
    roleConcepts: v.roleConcepts ?? {},
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function a3Lines(from: string, to: string) {
  const cfg = await getA3();
  const lines = await payrollLines(from, to);
  const period = from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : `${from}/${to}`;
  const groups = new Map<string, { worker: (typeof lines)[number]["a"]["worker"]; role: string; hours: number; amount: number; price: number; missing: number }>();
  for (const l of lines) {
    const key = `${l.a.workerId}|${l.a.role}`;
    const g = groups.get(key) ?? { worker: l.a.worker, role: l.a.role, hours: 0, amount: 0, price: l.hourlyRate, missing: 0 };
    g.hours += l.billedHours ?? 0;
    g.amount += l.amount;
    if (l.hours == null) g.missing++;
    groups.set(key, g);
  }
  const rows = [...groups.values()]
    .filter((g) => g.hours > 0)
    .sort((a, b) => a.worker.name.localeCompare(b.worker.name, "es") || ROLES.indexOf(a.role as Role) - ROLES.indexOf(b.role as Role))
    .map((g) => ({
      companyCode: cfg.companyCode,
      workerCode: g.worker.a3Code ?? "",
      nif: g.worker.dni ?? "",
      name: g.worker.name,
      concept: cfg.roleConcepts[g.role as Role] || cfg.hoursConcept,
      conceptName: `${cfg.hoursConceptName} · ${ROLE_LABEL[g.role as Role] ?? g.role}`,
      units: round2(g.hours),
      price: round2(g.price),
      amount: round2(g.amount),
      period,
      missing: g.missing,
    }));
  const withoutCode = [...new Map(rows.filter((r) => !r.workerCode).map((r) => [r.name, r.name])).values()];
  return { cfg, rows, withoutCode, pendingHours: [...groups.values()].reduce((s, g) => s + g.missing, 0) };
}

export const A3_HEADERS = ["Código empresa", "Código trabajador", "NIF", "Nombre", "Código concepto", "Concepto", "Unidades", "Precio", "Importe", "Periodo"];
