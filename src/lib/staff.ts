import { db } from "./db";
import { addDays, payable, rateFor, ROLE_LABEL, ROLES, type Role, workedHours } from "./domain";

// ---------- Documentación ----------

export const DOC_TYPES = ["DNI", "NSS", "MANIPULADOR", "CUENTA", "CONTRATO", "OTRO"] as const;
export const DOC_LABEL: Record<string, string> = {
  DNI: "DNI / NIE",
  NSS: "Tarjeta de la Seguridad Social",
  MANIPULADOR: "Carnet de manipulador de alimentos",
  CUENTA: "Certificado de cuenta bancaria",
  CONTRATO: "Contrato firmado",
  OTRO: "Otro",
};
/** Días de antelación con los que se avisa de que un documento va a caducar. */
export const DOC_WARN_DAYS = 30;

export type DocState = "sin-caducidad" | "vigente" | "caduca-pronto" | "caducado";

export function docState(expiresAt: string | null, today: string): DocState {
  if (!expiresAt) return "sin-caducidad";
  if (expiresAt < today) return "caducado";
  if (expiresAt <= addDays(today, DOC_WARN_DAYS)) return "caduca-pronto";
  return "vigente";
}

/** DNI (8 cifras + letra) o NIE (X/Y/Z + 7 cifras + letra), comprobando la letra de control. */
export function validDniNie(value: string) {
  const v = value.toUpperCase().replace(/[\s-]/g, "");
  const m = v.match(/^([XYZ]?)(\d{7,8})([A-Z])$/);
  if (!m) return false;
  const num = Number(`${"XYZ".indexOf(m[1]) >= 0 && m[1] ? "XYZ".indexOf(m[1]) : ""}${m[2]}`);
  return "TRWAGMYFPDXBNJZSQVHLCKE"[num % 23] === m[3];
}

/** IBAN (cualquier país) comprobando los dígitos de control. */
export function validIban(value: string) {
  const v = value.toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const moved = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of moved) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

export const formatIban = (v: string) => v.toUpperCase().replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();

// ---------- Uniforme y material ----------

const DEFAULT_UNIFORM: Record<Role, string[]> = {
  CAMARERO: ["Camisa blanca", "Pantalón negro", "Zapatos negros", "Sacacorchos"],
  RESPONSABLE: ["Camisa blanca", "Pantalón negro", "Zapatos negros", "Sacacorchos", "Libreta y bolígrafo"],
  MAITRE: ["Traje oscuro", "Corbata", "Zapatos negros"],
  MOZO: ["Ropa de trabajo cómoda", "Calzado de seguridad", "Guantes"],
};

export async function getUniform(): Promise<Record<Role, string[]>> {
  const row = await db.setting.findUnique({ where: { key: "uniforme" } });
  const saved = (row?.value ?? {}) as Partial<Record<Role, string[]>>;
  return Object.fromEntries(ROLES.map((r) => [r, Array.isArray(saved[r]) ? saved[r]! : DEFAULT_UNIFORM[r]])) as Record<Role, string[]>;
}

export const lines = (text: string | null | undefined) =>
  (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/** Qué debe llevar alguien a un evento: el uniforme de su puesto y lo específico del evento. */
export function checklistFor(uniform: Record<Role, string[]>, role: string, eventChecklist: string | null) {
  return { uniform: uniform[role as Role] ?? [], event: lines(eventChecklist), roleLabel: ROLE_LABEL[role as Role] ?? role };
}

// ---------- Nómina estimada del trabajador ----------

/** Servicios confirmados de un trabajador en un mes (YYYY-MM) con horas e importe estimado. */
export async function workerMonth(workerId: string, month: string) {
  const [assignments, rates] = await Promise.all([
    db.assignment.findMany({
      where: { workerId, status: "CONFIRMADO", event: { date: { gte: `${month}-01`, lte: `${month}-31` } } },
      include: { event: { select: { name: true, date: true, venue: true, type: true } }, worker: { select: { customRates: true } } },
      orderBy: { event: { date: "asc" } },
    }),
    db.rate.findMany(),
  ]);
  const rows = assignments.map((a) => {
    const hours = workedHours(a);
    const rate = rateFor(rates, a.role, a.event.type, a.worker.customRates);
    const { billedHours, amount } = payable(hours, rate);
    return { id: a.id, event: a.event, role: a.role, checkIn: a.checkIn, checkOut: a.checkOut, hours, billedHours, amount, hourlyRate: rate?.hourlyRate ?? 0 };
  });
  return {
    rows,
    services: rows.length,
    hours: rows.reduce((s, r) => s + (r.billedHours ?? 0), 0),
    amount: rows.reduce((s, r) => s + r.amount, 0),
    pending: rows.filter((r) => r.hours == null).length,
  };
}
