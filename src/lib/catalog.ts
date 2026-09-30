import { db } from "./db";

/** Fincas y clientes guardados para los desplegables del formulario de evento. */
export async function eventFormOptions() {
  const [venues, clients] = await Promise.all([
    db.venue.findMany({ select: { id: true, name: true, lat: true, lng: true, accessNotes: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { venues, clients };
}
