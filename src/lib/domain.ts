export const ROLES = ["CAMARERO", "MAITRE", "MOZO"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  CAMARERO: "Camarero",
  MAITRE: "Maître",
  MOZO: "Mozo",
};

export const ROLE_PLURAL: Record<Role, string> = {
  CAMARERO: "Camareros",
  MAITRE: "Maîtres",
  MOZO: "Mozos",
};

export const EVENT_TYPES = ["BODA", "EVENTO", "OTRO"] as const;
export const EVENT_TYPE_LABEL: Record<string, string> = {
  BODA: "Boda",
  EVENTO: "Evento",
  OTRO: "Otro",
};

export const STATUS_LABEL: Record<string, string> = {
  CONVOCADO: "Pendiente",
  CONFIRMADO: "Confirmado",
  RECHAZADO: "Rechazado",
  CANCELADO: "Cancelado",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function needFor(
  event: { needCamareros: number; needMaitres: number; needMozos: number },
  role: Role,
) {
  if (role === "CAMARERO") return event.needCamareros;
  if (role === "MAITRE") return event.needMaitres;
  return event.needMozos;
}

/** Hora de citación: los mozos entran a la hora de descarga si está definida. */
export function callTime(event: { startTime: string; unloadTime: string | null }, role: string) {
  return role === "MOZO" && event.unloadTime ? event.unloadTime : event.startTime;
}

const TZ = "Europe/Madrid";

/** Fecha de hoy en Madrid como YYYY-MM-DD. */
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Hora actual en Madrid como HH:MM. */
export function nowTime() {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(date: string, opts: { long?: boolean } = {}) {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    weekday: opts.long ? "long" : "short",
    day: "numeric",
    month: opts.long ? "long" : "short",
    year: opts.long ? "numeric" : undefined,
  }).format(d);
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Horas entre entrada y salida (admite salida pasada la medianoche), redondeadas a 0,25 h. */
export function hoursBetween(checkIn: string | null, checkOut: string | null) {
  if (!checkIn || !checkOut) return null;
  let diff = toMinutes(checkOut) - toMinutes(checkIn);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 4) / 4;
}

export function workedHours(a: {
  checkIn: string | null;
  checkOut: string | null;
  hoursOverride: number | null;
}) {
  return a.hoursOverride ?? hoursBetween(a.checkIn, a.checkOut);
}

export function payable(hours: number | null, rate: { hourlyRate: number; minHours: number } | undefined) {
  if (hours == null || !rate) return { billedHours: hours, amount: 0 };
  const billedHours = Math.max(hours, rate.minHours);
  return { billedHours, amount: Math.round(billedHours * rate.hourlyRate * 100) / 100 };
}

export const euro = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

export const num = (n: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n);

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
