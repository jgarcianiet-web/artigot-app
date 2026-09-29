"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { addDays, nowTime, today } from "@/lib/domain";

async function ownAssignment(token: string, assignmentId: string) {
  const a = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { worker: true, event: true },
  });
  if (!a || a.worker.token !== token || !a.worker.active) throw new Error("No autorizado");
  return a;
}

export async function respond(token: string, assignmentId: string, accept: boolean) {
  const a = await ownAssignment(token, assignmentId);
  if (a.event.date < today() || a.status === "CANCELADO" || a.checkIn) return;
  await db.assignment.update({
    where: { id: a.id },
    data: { status: accept ? "CONFIRMADO" : "RECHAZADO", respondedAt: new Date() },
  });
  revalidatePath(`/p/${token}`);
}

/** Fichaje: permitido el día del evento (y el día siguiente para la salida si pasa de medianoche). */
export async function clock(token: string, assignmentId: string, kind: "in" | "out") {
  const a = await ownAssignment(token, assignmentId);
  if (a.status !== "CONFIRMADO") return;
  const d = today();
  if (kind === "in" && d === a.event.date && !a.checkIn) {
    await db.assignment.update({ where: { id: a.id }, data: { checkIn: nowTime() } });
  }
  if (kind === "out" && a.checkIn && !a.checkOut && (d === a.event.date || d === addDays(a.event.date, 1))) {
    await db.assignment.update({ where: { id: a.id }, data: { checkOut: nowTime() } });
  }
  revalidatePath(`/p/${token}`);
}

export async function toggleUnavailable(token: string, date: string) {
  const worker = await db.worker.findUnique({ where: { token } });
  if (!worker || !worker.active || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) return;
  const existing = await db.unavailability.findUnique({ where: { workerId_date: { workerId: worker.id, date } } });
  if (existing) await db.unavailability.delete({ where: { id: existing.id } });
  else await db.unavailability.create({ data: { workerId: worker.id, date } });
  revalidatePath(`/p/${token}`);
}
