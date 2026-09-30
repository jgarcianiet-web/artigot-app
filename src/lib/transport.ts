import { db } from "./db";

/**
 * Transporte a los eventos: cada persona confirmada indica si va por su cuenta, si lleva coche
 * (y cuántas plazas libres tiene) o si necesita que la lleven. Los pasajeros se apuntan a un coche
 * desde la app o RRHH los reparte (a mano o automáticamente, primero por zona).
 */

export const TRANSPORT = {
  PROPIO: "Voy por mi cuenta",
  CONDUZCO: "Llevo coche",
  NECESITO: "Necesito que me lleven",
} as const;
export type TransportMode = keyof typeof TRANSPORT;
export const isTransport = (v: unknown): v is TransportMode => typeof v === "string" && v in TRANSPORT;
export const MAX_SEATS = 8;

type Row = {
  id: string;
  workerId: string;
  role: string;
  transport: string | null;
  seats: number | null;
  rideWithId: string | null;
  worker: { name: string; phone: string; zone: string | null };
};

export type Car = { driver: Row; seats: number; passengers: Row[]; free: number };

/** Estado del transporte de un evento (solo personal confirmado). */
export async function eventTransport(eventId: string) {
  const rows: Row[] = await db.assignment.findMany({
    where: { eventId, status: "CONFIRMADO" },
    select: { id: true, workerId: true, role: true, transport: true, seats: true, rideWithId: true, worker: { select: { name: true, phone: true, zone: true } } },
    orderBy: { worker: { name: "asc" } },
  });
  const cars = new Map<string, Car>();
  for (const r of rows) if (r.transport === "CONDUZCO") cars.set(r.id, { driver: r, seats: r.seats ?? 0, passengers: [], free: r.seats ?? 0 });
  const needing: Row[] = [];
  for (const r of rows) {
    if (r.transport !== "NECESITO") continue;
    const car = r.rideWithId ? cars.get(r.rideWithId) : undefined;
    if (car) {
      car.passengers.push(r);
      car.free--;
    } else needing.push(r);
  }
  return {
    rows,
    cars: [...cars.values()],
    needing,
    unanswered: rows.filter((r) => !r.transport),
    own: rows.filter((r) => r.transport === "PROPIO"),
    carOf: (assignmentId: string) => [...cars.values()].find((c) => c.passengers.some((p) => p.id === assignmentId)),
  };
}

const sameZone = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Reparte a quien necesita coche entre los coches con plazas, primero con quien vive en su misma zona. */
export async function autoAssignRides(eventId: string) {
  const t = await eventTransport(eventId);
  const moves: { passenger: Row; driver: Row }[] = [];
  for (const p of t.needing) {
    const options = t.cars.filter((c) => c.free > 0);
    if (!options.length) break;
    options.sort((a, b) => Number(sameZone(b.driver.worker.zone, p.worker.zone)) - Number(sameZone(a.driver.worker.zone, p.worker.zone)) || b.free - a.free);
    const car = options[0];
    car.free--;
    car.passengers.push(p);
    moves.push({ passenger: p, driver: car.driver });
  }
  for (const m of moves) await db.assignment.update({ where: { id: m.passenger.id }, data: { rideWithId: m.driver.id } });
  return { moves, stillNeeding: t.needing.length - moves.length };
}
