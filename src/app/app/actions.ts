"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { destroySession, requireWorker, workerLogin } from "@/lib/auth";
import { db } from "@/lib/db";
import { forgetDevice } from "@/lib/devices";
import { checkClock } from "@/lib/clockRules";
import { formatDate, nowTime, today } from "@/lib/domain";
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

export type ClockResult = { ok: boolean; message: string };

/**
 * Fichaje con geolocalización. El servidor comprueba con su propia hora que se está dentro
 * de la ventana (30 min antes de la citación → 30 min después del fin) y a menos de 200 m.
 */
export async function clock(
  assignmentId: string,
  kind: "in" | "out",
  position: { lat: number; lng: number; accuracy: number },
): Promise<ClockResult> {
  const { a } = await ownAssignment(assignmentId);
  if (a.status !== "CONFIRMADO") return { ok: false, message: "Solo puede fichar el personal confirmado." };
  if (kind === "in" && a.checkIn) return { ok: false, message: `Ya fichaste la entrada a las ${a.checkIn}.` };
  if (kind === "out" && !a.checkIn) return { ok: false, message: "Primero tienes que fichar la entrada." };
  if (kind === "out" && a.checkOut) return { ok: false, message: `Ya fichaste la salida a las ${a.checkOut}.` };

  const pos = { lat: Number(position?.lat), lng: Number(position?.lng), accuracy: Number(position?.accuracy) };
  const check = checkClock({ event: a.event, role: a.role, position: pos });
  if (!check.ok) return { ok: false, message: check.reason };

  const time = nowTime();
  const accuracy = Math.round(pos.accuracy);
  await db.assignment.update({
    where: { id: a.id },
    data:
      kind === "in"
        ? { checkIn: time, checkInLat: pos.lat, checkInLng: pos.lng, checkInDistance: check.distance, checkInAccuracy: accuracy, checkInManual: false }
        : { checkOut: time, checkOutLat: pos.lat, checkOutLng: pos.lng, checkOutDistance: check.distance, checkOutAccuracy: accuracy, checkOutManual: false },
  });
  revalidatePath("/app", "layout");
  revalidatePath(`/admin/eventos/${a.eventId}`);
  return {
    ok: true,
    message: `${kind === "in" ? "Entrada" : "Salida"} registrada a las ${time} (a ${check.distance} m del evento).`,
  };
}

export async function toggleUnavailable(date: string) {
  const worker = await requireWorker();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) return;
  const existing = await db.unavailability.findUnique({ where: { workerId_date: { workerId: worker.id, date } } });
  if (existing) await db.unavailability.delete({ where: { id: existing.id } });
  else await db.unavailability.create({ data: { workerId: worker.id, date } });
  revalidatePath("/app");
}
