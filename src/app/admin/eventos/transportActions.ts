"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auditAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { notify } from "@/lib/push";
import { autoAssignRides, eventTransport, isTransport, MAX_SEATS, TRANSPORT } from "@/lib/transport";

const refresh = (eventId: string) => {
  revalidatePath(`/admin/eventos/${eventId}`);
  revalidatePath(`/app/eventos/${eventId}`);
};

/** Punto y hora de encuentro (opcionalmente avisando al equipo confirmado). */
export async function saveMeeting(eventId: string, form: FormData) {
  const by = await requireAdmin();
  const meetingPoint = String(form.get("meetingPoint") ?? "").trim().slice(0, 200) || null;
  const time = String(form.get("meetingTime") ?? "").trim();
  const meetingTime = /^\d{2}:\d{2}$/.test(time) ? time : null;
  const e = await db.event.update({ where: { id: eventId }, data: { meetingPoint, meetingTime } });
  await auditAdmin(by, "Evento", "Punto de encuentro", `${e.name}: ${meetingPoint ?? "sin punto"}${meetingTime ? ` a las ${meetingTime}` : ""}`, { entityId: eventId });
  if (form.get("notify") === "1" && meetingPoint) {
    const team = await db.assignment.findMany({ where: { eventId, status: "CONFIRMADO" }, select: { workerId: true } });
    after(() =>
      notify({
        workerIds: team.map((t) => t.workerId),
        workerUrl: `/app/eventos/${eventId}`,
        title: `Punto de encuentro · ${e.name}`,
        body: `${meetingPoint}${meetingTime ? ` a las ${meetingTime}` : ""} (${formatDate(e.date)}).`,
        tag: `encuentro-${eventId}`,
      }),
    );
  }
  refresh(eventId);
}

/** RRHH fija el modo, las plazas y el coche de cada persona. Se respetan las plazas de cada coche. */
export async function saveTransportAdmin(eventId: string, form: FormData) {
  const by = await requireAdmin();
  const before = await eventTransport(eventId);
  const want = before.rows.map((r) => {
    const mode = String(form.get(`mode_${r.id}`) ?? "");
    const seats = Math.max(0, Math.min(MAX_SEATS, Math.round(Number(form.get(`seats_${r.id}`)) || 0)));
    return { r, mode: isTransport(mode) ? mode : null, seats, ride: String(form.get(`ride_${r.id}`) ?? "") || null };
  });
  const capacity = new Map(want.filter((w) => w.mode === "CONDUZCO").map((w) => [w.r.id, w.seats]));
  const used = new Map<string, number>();
  const changes: string[] = [];
  const notifyRides: { workerId: string; driver: string }[] = [];
  for (const w of want) {
    let ride: string | null = null;
    if (w.mode === "NECESITO" && w.ride && capacity.has(w.ride) && (used.get(w.ride) ?? 0) < capacity.get(w.ride)!) {
      ride = w.ride;
      used.set(ride, (used.get(ride) ?? 0) + 1);
    }
    const seats = w.mode === "CONDUZCO" ? w.seats : null;
    if (w.mode !== w.r.transport || seats !== w.r.seats || ride !== w.r.rideWithId) {
      await db.assignment.update({ where: { id: w.r.id }, data: { transport: w.mode, seats, rideWithId: ride } });
      const driver = ride ? before.rows.find((x) => x.id === ride)?.worker.name : null;
      changes.push(`${w.r.worker.name}: ${w.mode ? TRANSPORT[w.mode].toLowerCase() : "sin indicar"}${seats != null ? ` (${seats} plazas)` : ""}${driver ? `, con ${driver}` : ""}`);
      if (ride && ride !== w.r.rideWithId && driver) notifyRides.push({ workerId: w.r.workerId, driver });
    }
  }
  if (changes.length) {
    const e = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } });
    await auditAdmin(by, "Transporte", "Cambios", `${e.name}: ${changes.join("; ")}`, { entityId: eventId });
    after(async () => {
      for (const n of notifyRides) {
        await notify({ workerIds: [n.workerId], workerUrl: `/app/eventos/${eventId}`, title: "Coche asignado", body: `Vas en el coche de ${n.driver} a ${e.name}. Mira el punto de encuentro en la app.`, tag: `coche-${eventId}` });
      }
    });
  }
  refresh(eventId);
}

export async function autoAssignAction(eventId: string) {
  const by = await requireAdmin();
  const { moves } = await autoAssignRides(eventId);
  if (moves.length) {
    const e = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } });
    await auditAdmin(by, "Transporte", "Reparto automático", `${e.name}: ${moves.map((m) => `${m.passenger.worker.name} con ${m.driver.worker.name}`).join("; ")}`, { entityId: eventId });
    after(async () => {
      for (const m of moves) {
        await notify({ workerIds: [m.passenger.workerId], workerUrl: `/app/eventos/${eventId}`, title: "Coche asignado", body: `Vas en el coche de ${m.driver.worker.name} a ${e.name}.`, tag: `coche-${eventId}` });
      }
      const drivers = [...new Set(moves.map((m) => m.driver.workerId))];
      await notify({ workerIds: drivers, workerUrl: `/app/eventos/${eventId}`, title: "Pasajeros en tu coche", body: `Tienes pasajeros para ${e.name}. Mira quiénes son en la app.`, tag: `coche-${eventId}` });
    });
  }
  refresh(eventId);
}

/** Pide a quien no ha dicho cómo va que lo indique. */
export async function askTransport(eventId: string) {
  await requireAdmin();
  const t = await eventTransport(eventId);
  const e = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } });
  if (t.unanswered.length) {
    after(() =>
      notify({
        workerIds: t.unanswered.map((r) => r.workerId),
        workerUrl: `/app/eventos/${eventId}`,
        title: "¿Cómo vas al evento?",
        body: `Indica en la app si llevas coche, si necesitas que te lleven o si vas por tu cuenta a ${e.name}.`,
        tag: `coche-${eventId}`,
      }),
    );
  }
  refresh(eventId);
}
