import { db } from "@/lib/db";

/** Personal activo para elegir los miembros de un grupo. */
export async function pickableWorkers() {
  const ws = await db.worker.findMany({ where: { active: true }, select: { id: true, name: true, dni: true, phone: true, role: true, roles: true }, orderBy: { name: "asc" } });
  return ws.map((w) => ({ id: w.id, name: w.name, dni: w.dni, phone: w.phone, roles: [...new Set([w.role, ...w.roles])] }));
}
