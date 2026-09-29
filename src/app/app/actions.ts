"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { destroySession, requireWorker, workerLogin } from "@/lib/auth";
import { db } from "@/lib/db";
import { forgetDevice } from "@/lib/devices";
import { addDays, formatDate, nowTime, today } from "@/lib/domain";
import { notify } from "@/lib/push";

export async function login(_prev: string | null, form: FormData) {
  const error = await workerLogin(String(form.get("phone") ?? ""), String(form.get("code") ?? ""));
  if (error) return error;
  redirect("/app");
}

export async function logout() {
  await forgetDevice();
  await destroySession();
  redirect("/entrar");
}

async function ownAssignment(assignmentId: string) {
  const worker = await requireWorker();
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, include: { event: true } });
  if (!a || a.workerId !== worker.id) throw new Error("No autorizado");
  return { a, worker };
}

export async function respond(assignmentId: string, accept: boolean) {
  const { a, worker } = await ownAssignment(assignmentId);
  if (a.event.date < today() || a.status === "CANCELADO" || a.checkIn) return;
  const status = accept ? "CONFIRMADO" : "RECHAZADO";
  if (a.status === status) return;
  await db.assignment.update({ where: { id: a.id }, data: { status, respondedAt: new Date() } });
  after(() =>
    notify({
      admins: true,
      adminUrl: `/admin/eventos/${a.eventId}`,
      title: accept ? "✅ Convocatoria aceptada" : "❌ Convocatoria rechazada",
      body: `${worker.name} ${accept ? "confirma" : a.status === "CONFIRMADO" ? "ya no puede ir a" : "no puede ir a"} ${a.event.name} (${formatDate(a.event.date)})`,
      tag: `resp-${a.id}`,
    }),
  );
  revalidatePath("/app", "layout");
}

/** Fichaje: permitido el día del evento (y el día siguiente para la salida si pasa de medianoche). */
export async function clock(assignmentId: string, kind: "in" | "out") {
  const { a } = await ownAssignment(assignmentId);
  if (a.status !== "CONFIRMADO") return;
  const d = today();
  if (kind === "in" && d === a.event.date && !a.checkIn) {
    await db.assignment.update({ where: { id: a.id }, data: { checkIn: nowTime() } });
  }
  if (kind === "out" && a.checkIn && !a.checkOut && (d === a.event.date || d === addDays(a.event.date, 1))) {
    await db.assignment.update({ where: { id: a.id }, data: { checkOut: nowTime() } });
  }
  revalidatePath("/app", "layout");
}

export async function toggleUnavailable(date: string) {
  const worker = await requireWorker();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) return;
  const existing = await db.unavailability.findUnique({ where: { workerId_date: { workerId: worker.id, date } } });
  if (existing) await db.unavailability.delete({ where: { id: existing.id } });
  else await db.unavailability.create({ data: { workerId: worker.id, date } });
  revalidatePath("/app");
}
