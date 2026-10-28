import { db } from "./db";
import { EVENT_TYPES, type Role } from "./domain";

/**
 * Ajustes → Automatizaciones: lo que la app hace sola con los eventos y el personal.
 * - Convocatoria automática: cada evento puede convocarse solo X días antes (por defecto en los eventos nuevos).
 * - Disponibilidad semanal: un día a la semana se pregunta a todo el personal qué días puede trabajar la siguiente.
 * - Personal por invitados: proporciones por tipo de evento para calcular el personal necesario.
 * - Email diario de A3: los Excel de las altas de mañana (y las bajas de hoy) a RRHH.
 */

export type Ratio = {
  /** Invitados por persona (0 = no se calcula ese puesto) */
  camareros: number;
  maitres: number;
  mozos: number;
  /** Mínimo de maîtres en cuanto hay invitados */
  minMaitres: number;
};

export type AutomationSettings = {
  convoke: { defaultOn: boolean; days: number; hour: string };
  availability: { enabled: boolean; weekday: number; hour: string; days: number[]; remind: boolean };
  ratios: Record<string, Ratio>;
  a3Email: { enabled: boolean; hour: string; to: string };
};

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  convoke: { defaultOn: true, days: 7, hour: "10:00" },
  // Lunes a las 10:00 se pregunta por la semana siguiente (de lunes a domingo); al día siguiente, recordatorio
  availability: { enabled: true, weekday: 1, hour: "10:00", days: [1, 2, 3, 4, 5, 6, 0], remind: true },
  ratios: {
    BODA: { camareros: 12, maitres: 150, mozos: 100, minMaitres: 1 },
    EVENTO: { camareros: 20, maitres: 200, mozos: 150, minMaitres: 1 },
    OTRO: { camareros: 20, maitres: 0, mozos: 0, minMaitres: 0 },
  },
  a3Email: { enabled: true, hour: "18:00", to: "" },
};

const KEY = "automatizaciones";

export async function getAutomation(): Promise<AutomationSettings> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const saved = (row?.value ?? {}) as Partial<AutomationSettings>;
  const d = AUTOMATION_DEFAULTS;
  return {
    convoke: { ...d.convoke, ...saved.convoke },
    availability: { ...d.availability, ...saved.availability },
    ratios: Object.fromEntries(EVENT_TYPES.map((t) => [t, { ...d.ratios[t], ...saved.ratios?.[t] }])),
    a3Email: { ...d.a3Email, ...saved.a3Email },
  };
}

export async function saveAutomation(value: AutomationSettings) {
  const json = JSON.parse(JSON.stringify(value));
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
}

/** Personal necesario según los invitados y las proporciones del tipo de evento (redondeando hacia arriba). */
export function staffForGuests(guests: number, r: Ratio): Partial<Record<Role, number>> {
  if (!(guests > 0)) return {};
  const per = (n: number) => (n > 0 ? Math.ceil(guests / n) : 0);
  return { CAMARERO: per(r.camareros), MAITRE: r.maitres > 0 || r.minMaitres > 0 ? Math.max(r.minMaitres, per(r.maitres)) : 0, MOZO: per(r.mozos) };
}

export const WEEKDAY_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** El lunes de la semana siguiente a una fecha. */
export function nextMonday(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

export const isHour = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
