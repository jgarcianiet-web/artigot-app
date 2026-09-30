import { after } from "next/server";
import { db } from "./db";
import { ROLE_LABEL, today, workedHours, type Role } from "./domain";
import { notify } from "./push";

/**
 * Registro de jornada (art. 34.9 del Estatuto de los Trabajadores): hora de inicio y fin de cada día
 * trabajado. Se conserva 4 años y está a disposición del trabajador y de la Inspección de Trabajo.
 * Cada mes se genera un resumen por persona, que lo firma en la app (con observaciones si no está conforme).
 */

export type RecordRow = {
  date: string;
  event: string;
  venue: string;
  role: string;
  checkIn: string | null;
  checkOut: string | null;
  hours: number | null;
  origin: string;
};

export type RecordData = { month: string; rows: RecordRow[]; totalHours: number; days: number; incomplete: number; generatedAt: string };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
export const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
export const shiftMonth = (month: string, d: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
};

function origin(a: { checkInManual: boolean; checkOutManual: boolean; checkInOffline: boolean; checkOutOffline: boolean; checkInDistance: number | null; hoursOverride: number | null }) {
  if (a.hoursOverride != null) return "Horas fijadas por RRHH";
  if (a.checkInManual || a.checkOutManual) return "Corregido por RRHH";
  if (a.checkInOffline || a.checkOutOffline) return "Fichaje GPS (sin cobertura)";
  if (a.checkInDistance != null) return "Fichaje GPS";
  return "Sin fichaje";
}

/** Días trabajados de cada persona en el mes (solo servicios confirmados hasta hoy). */
export async function monthRecords(month: string, workerId?: string) {
  const to = [lastDayOf(month), today()].sort()[0];
  const assignments = await db.assignment.findMany({
    where: { status: "CONFIRMADO", event: { date: { gte: `${month}-01`, lte: to } }, ...(workerId && { workerId }) },
    include: { event: { select: { name: true, date: true, venue: true } }, worker: { select: { id: true, name: true, dni: true, nss: true } } },
    orderBy: [{ event: { date: "asc" } }, { event: { startTime: "asc" } }],
  });
  const by = new Map<string, { worker: (typeof assignments)[number]["worker"]; data: RecordData }>();
  for (const a of assignments) {
    const g = by.get(a.workerId) ?? {
      worker: a.worker,
      data: { month, rows: [], totalHours: 0, days: 0, incomplete: 0, generatedAt: new Date().toISOString() },
    };
    const hours = workedHours(a);
    g.data.rows.push({
      date: a.event.date,
      event: a.event.name,
      venue: a.event.venue,
      role: ROLE_LABEL[a.role as Role] ?? a.role,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      hours,
      origin: origin(a),
    });
    g.data.totalHours = Math.round((g.data.totalHours + (hours ?? 0)) * 100) / 100;
    if (hours == null) g.data.incomplete++;
    by.set(a.workerId, g);
  }
  for (const g of by.values()) g.data.days = new Set(g.data.rows.map((r) => r.date)).size;
  return [...by.values()].sort((a, b) => a.worker.name.localeCompare(b.worker.name, "es"));
}

export const recordTitle = (month: string) => `Registro de jornada · ${monthLabel(month)}`;

/** Documentos de registro de jornada del mes (el último de cada persona). */
export async function monthRecordDocs(month: string, workerId?: string) {
  return db.contract.findMany({
    where: { kind: "JORNADA", data: { path: ["month"], equals: month }, ...(workerId && { workerId }) },
    orderBy: { createdAt: "desc" },
    select: { id: true, workerId: true, signedAt: true, signerNote: true, data: true },
  });
}

function recordBody(worker: { name: string; dni: string | null }, data: RecordData) {
  return `Registro diario de jornada de ${worker.name}${worker.dni ? ` (DNI/NIE ${worker.dni})` : ""} correspondiente a ${monthLabel(data.month)}, conforme al artículo 34.9 del Estatuto de los Trabajadores.

Días trabajados: ${data.days}. Horas totales: ${String(data.totalHours).replace(".", ",")}.${data.incomplete ? ` ${data.incomplete} servicio(s) sin hora de entrada o salida.` : ""}

Con mi firma confirmo que he recibido este registro. Si algún dato no es correcto, lo indico en las observaciones.`;
}

/** Genera (o actualiza, si no está firmado) el registro del mes de cada persona y le pide que lo firme. */
export async function generateTimeRecords(month: string, createdBy: string, opts: { workerId?: string; inRequest?: boolean } = {}) {
  const onlyWorkerId = opts.workerId;
  const [records, docs] = await Promise.all([monthRecords(month, onlyWorkerId), monthRecordDocs(month, onlyWorkerId)]);
  let created = 0, updated = 0, signed = 0;
  const notifyIds: string[] = [];
  for (const { worker, data } of records) {
    const existing = docs.filter((d) => d.workerId === worker.id);
    if (existing.some((d) => d.signedAt)) {
      signed++;
      continue;
    }
    const body = recordBody(worker, data);
    const json = JSON.parse(JSON.stringify(data));
    if (existing[0]) {
      await db.contract.update({ where: { id: existing[0].id }, data: { body, data: json } });
      updated++;
    } else {
      await db.contract.create({ data: { kind: "JORNADA", workerId: worker.id, title: recordTitle(month), body, data: json, createdBy } });
      created++;
      notifyIds.push(worker.id);
    }
  }
  if (notifyIds.length) {
    const send = () =>
      notify({
        workerIds: notifyIds,
        workerUrl: "/app",
        title: "Registro de jornada",
        body: `Revisa y firma tu registro de horas de ${monthLabel(month)}.`,
        tag: `jornada-${month}`,
      });
    // Dentro de una petición se envía después de responder; desde los avisos automáticos, en el momento
    if (opts.inRequest === false) await send();
    else after(send);
  }
  return { created, updated, signed, total: records.length };
}

/** ¿Ha cambiado el registro después de firmarlo? (p. ej. RRHH corrigió unas horas) */
export function changedSinceSigned(signed: unknown, current: RecordData | undefined) {
  const s = signed as RecordData | null;
  if (!s || !current) return false;
  const key = (d: RecordData) => JSON.stringify(d.rows.map((r) => [r.date, r.event, r.checkIn, r.checkOut, r.hours]));
  return key(s) !== key(current);
}
