import { db } from "./db";

/** Fincas y clientes guardados para los desplegables del formulario de evento. */
export async function eventFormOptions() {
  const [venues, clients, reps] = await Promise.all([
    db.venue.findMany({ select: { id: true, name: true, lat: true, lng: true, accessNotes: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.event.findMany({ where: { salesRep: { not: null } }, distinct: ["salesRep"], select: { salesRep: true }, orderBy: { salesRep: "asc" } }),
  ]);
  return { venues, clients, salesReps: reps.map((r) => r.salesRep!) };
}
