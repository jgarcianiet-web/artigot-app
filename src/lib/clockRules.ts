import { addDays, callTime } from "./domain";

/**
 * Reglas del fichaje:
 *  - Distancia máxima al lugar del evento: CLOCK_RADIUS_M (200 m por defecto).
 *  - Ventana horaria: desde CLOCK_MARGIN_MIN antes de la hora de citación del puesto
 *    hasta CLOCK_MARGIN_MIN después de la hora de fin del evento.
 * Todo se valida en el servidor con su propia hora; el móvil solo aporta la posición.
 */
export const CLOCK_RADIUS_M = Number(process.env.CLOCK_RADIUS_M ?? 200);
export const CLOCK_MARGIN_MIN = 30;
/** Si el GPS da una precisión peor que esto, no se puede asegurar la distancia. */
export const MAX_ACCURACY_M = 200;
/** Eventos antiguos sin hora de fin: se asume esta duración. */
const DEFAULT_DURATION_H = 12;

const TZ = "Europe/Madrid";

/** Diferencia (ms) entre la hora de Madrid y UTC en un instante dado. */
function madridOffset(at: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at;
}

/** Fecha (YYYY-MM-DD) y hora (HH:MM) en Madrid → instante real. Tiene en cuenta el horario de verano. */
export function madridTime(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, mi);
  let t = naive - madridOffset(naive);
  t = naive - madridOffset(t); // segunda pasada por si cae justo en el cambio de hora
  return new Date(t);
}

type EventTimes = { date: string; startTime: string; endTime: string | null; unloadTime: string | null };

/** Inicio (citación del puesto) y fin del servicio como instantes reales. */
export function serviceSpan(event: EventTimes, role: string) {
  const start = madridTime(event.date, callTime(event, role));
  const serviceStart = madridTime(event.date, event.startTime);
  let end: Date;
  if (event.endTime) {
    end = madridTime(event.date, event.endTime);
    // Fin igual o anterior al inicio del servicio: termina al día siguiente (p. ej. 18:00 → 02:00)
    if (end <= serviceStart) end = madridTime(addDays(event.date, 1), event.endTime);
  } else {
    end = new Date(serviceStart.getTime() + DEFAULT_DURATION_H * 3600_000);
  }
  return { start, end };
}

export function clockWindow(event: EventTimes, role: string) {
  const { start, end } = serviceSpan(event, role);
  const margin = CLOCK_MARGIN_MIN * 60_000;
  return { opensAt: new Date(start.getTime() - margin), closesAt: new Date(end.getTime() + margin) };
}

/** Distancia en metros entre dos coordenadas (fórmula del semiverseno). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export type ClockCheck =
  | { ok: true; distance: number }
  | { ok: false; reason: string };

/** Comprueba todas las reglas para fichar en este momento desde esta posición. */
export function checkClock(opts: {
  event: EventTimes & { lat: number | null; lng: number | null };
  role: string;
  position: { lat: number; lng: number; accuracy: number };
  now?: Date;
}): ClockCheck {
  const { event, role, position } = opts;
  const now = opts.now ?? new Date();
  if (event.lat == null || event.lng == null) {
    return { ok: false, reason: "RRHH aún no ha fijado la ubicación de este evento. Avísales para poder fichar." };
  }
  const { opensAt, closesAt } = clockWindow(event, role);
  if (now < opensAt) {
    return { ok: false, reason: `Todavía no se puede fichar: el fichaje abre a las ${hhmm(opensAt)} (30 min antes de tu citación).` };
  }
  if (now > closesAt) {
    return { ok: false, reason: `El fichaje cerró a las ${hhmm(closesAt)} (30 min después del fin del evento). Habla con RRHH.` };
  }
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) {
    return { ok: false, reason: "No se ha podido leer tu ubicación." };
  }
  if (!(position.accuracy > 0) || position.accuracy > MAX_ACCURACY_M) {
    return {
      ok: false,
      reason: `La señal de ubicación es poco precisa (±${Math.round(position.accuracy)} m). Activa el GPS o sal a un lugar abierto e inténtalo de nuevo.`,
    };
  }
  const distance = distanceMeters(position, { lat: event.lat, lng: event.lng });
  if (distance > CLOCK_RADIUS_M) {
    const km = distance >= 1000 ? `${(distance / 1000).toFixed(1).replace(".", ",")} km` : `${distance} m`;
    return { ok: false, reason: `Estás a ${km} del evento. Tienes que estar a menos de ${CLOCK_RADIUS_M} m para fichar.` };
  }
  return { ok: true, distance };
}
