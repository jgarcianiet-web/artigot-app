import { Prisma } from "@prisma/client";
import { clockWindow, hhmm, madridTime } from "./clockRules";
import { db } from "./db";
import { addDays, callTime, formatDate, isLeadRole, LEAD_ROLES, ROLE_LABEL, type Role } from "./domain";
import { notify } from "./push";
import { REVIEW_DAYS } from "./reviews";

/**
 * Avisos automáticos. Se comprueban cada pocos minutos; cada aviso se registra en ReminderLog
 * con una clave única, así que nunca se envía dos veces (ni con varios servidores a la vez).
 */
export const REMINDERS = {
  /** Horas sin responder a una convocatoria hasta recordárselo al trabajador */
  PENDING_WORKER_H: 12,
  /** Horas sin responder hasta avisar a RRHH */
  PENDING_RRHH_H: 24,
  /** Hora (Madrid) del día anterior a partir de la que se envía el recordatorio del evento */
  DAY_BEFORE_HOUR: "17:00",
  /** Minutos tras la citación sin fichar para avisar de un posible retraso */
  LATE_AFTER_MIN: 10,
  /** Hora (Madrid) del día siguiente al evento para recordar las valoraciones pendientes */
  REVIEW_REMINDER_HOUR: "10:00",
  INTERVAL_MS: 5 * 60_000,
};

const madridDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

/** Reserva la clave del aviso; devuelve false si ya se había enviado. */
async function claim(key: string) {
  try {
    await db.reminderLog.create({ data: { key } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export async function runReminders(now = new Date()) {
  const today = madridDate(now);
  const sent: string[] = [];
  const hours = (ms: number) => ms / 3_600_000;

  // 1. Convocatorias sin responder: recordatorio al trabajador y, más tarde, aviso a RRHH
  const pending = await db.assignment.findMany({
    where: { status: "CONVOCADO", event: { date: { gte: today }, status: "ABIERTO" } },
    include: { event: true, worker: { select: { name: true } } },
  });
  for (const a of pending) {
    const waited = hours(now.getTime() - a.createdAt.getTime());
    if (waited >= REMINDERS.PENDING_WORKER_H && (await claim(`pendiente-trabajador:${a.id}`))) {
      await notify({
        workerIds: [a.workerId],
        workerUrl: `/app/eventos/${a.eventId}`,
        title: "Convocatoria pendiente",
        body: `Aún no has respondido a ${a.event.name} (${formatDate(a.event.date)}). ¿Puedes ir?`,
        tag: `inv-${a.eventId}`,
      });
      sent.push(`pendiente-trabajador:${a.worker.name}`);
    }
    if (waited >= REMINDERS.PENDING_RRHH_H && (await claim(`pendiente-rrhh:${a.id}`))) {
      await notify({
        admins: true,
        adminUrl: `/admin/eventos/${a.eventId}`,
        title: "Sin respuesta",
        body: `${a.worker.name} lleva ${Math.floor(waited)} h sin responder a ${a.event.name} (${formatDate(a.event.date)}).`,
        tag: `sinresp-${a.id}`,
      });
      sent.push(`pendiente-rrhh:${a.worker.name}`);
    }
  }

  // 2. Recordatorio el día anterior al equipo confirmado
  const tomorrow = addDays(today, 1);
  if (now >= madridTime(today, REMINDERS.DAY_BEFORE_HOUR)) {
    const team = await db.assignment.findMany({
      where: { status: "CONFIRMADO", event: { date: tomorrow, status: "ABIERTO" } },
      include: { event: true },
    });
    for (const a of team) {
      if (!(await claim(`dia-antes:${a.id}`))) continue;
      await notify({
        workerIds: [a.workerId],
        workerUrl: `/app/eventos/${a.eventId}`,
        title: `Mañana: ${a.event.name}`,
        body: `Citación a las ${callTime(a.event, a.role)} en ${a.event.venue}${a.event.notes ? ". Revisa las notas del evento." : "."}`,
        tag: `manana-${a.eventId}`,
      });
      sent.push(`dia-antes:${a.id}`);
    }
  }

  // 3. Posible retraso: confirmado sin fichar pasados unos minutos de su citación
  const todays = await db.assignment.findMany({
    where: { status: "CONFIRMADO", checkIn: null, event: { date: { in: [today, addDays(today, -1)] } } },
    include: { event: true, worker: { select: { name: true, phone: true } } },
  });
  for (const a of todays) {
    const call = madridTime(a.event.date, callTime(a.event, a.role));
    const lateFrom = new Date(call.getTime() + REMINDERS.LATE_AFTER_MIN * 60_000);
    if (now < lateFrom || now > clockWindow(a.event, a.role).closesAt) continue;
    if (!(await claim(`retraso:${a.id}`))) continue;
    const leads = await db.assignment.findMany({
      where: { eventId: a.eventId, status: "CONFIRMADO", role: { in: [...LEAD_ROLES] }, workerId: { not: a.workerId } },
      select: { workerId: true },
    });
    await notify({
      workerIds: [a.workerId],
      workerUrl: "/app",
      title: "¿Llegas tarde?",
      body: `Tu citación en ${a.event.name} era a las ${hhmm(call)} y no has fichado. Ficha al llegar o avisa por el chat.`,
      tag: `retraso-${a.id}`,
    });
    await notify({
      workerIds: leads.map((l) => l.workerId),
      workerUrl: `/app/eventos/${a.eventId}/equipo`,
      admins: true,
      adminUrl: `/admin/eventos/${a.eventId}/directo`,
      title: "⏰ Sin fichar",
      body: `${a.worker.name} (${ROLE_LABEL[a.role as Role]?.toLowerCase() ?? a.role}) no ha fichado en ${a.event.name}; citación a las ${hhmm(call)}. Tel. ${a.worker.phone}`,
      tag: `retraso-${a.id}`,
    });
    sent.push(`retraso:${a.worker.name}`);
  }

  // 4. Valoraciones pendientes: la mañana siguiente al evento, al maître / camarero responsable
  if (now >= madridTime(today, REMINDERS.REVIEW_REMINDER_HOUR)) {
    const leads = await db.assignment.findMany({
      where: {
        status: "CONFIRMADO",
        role: { in: [...LEAD_ROLES] },
        event: { date: { gte: addDays(today, -REVIEW_DAYS), lt: today } },
      },
      include: {
        event: {
          include: {
            assignments: { where: { status: "CONFIRMADO" }, select: { workerId: true, role: true } },
            reviews: { select: { workerId: true, reviewerId: true } },
          },
        },
      },
    });
    for (const l of leads) {
      const team = l.event.assignments.filter((a) => !isLeadRole(a.role));
      const done = new Set(l.event.reviews.filter((r) => r.reviewerId === l.workerId).map((r) => r.workerId));
      const missing = team.filter((a) => !done.has(a.workerId)).length;
      if (!missing || !(await claim(`valorar:${l.id}`))) continue;
      await notify({
        workerIds: [l.workerId],
        workerUrl: `/app/eventos/${l.eventId}/valorar`,
        title: "Valora a tu equipo",
        body: `Te faltan ${missing} valoraciones de ${l.event.name}. Hasta completarlas no podrás aceptar nuevas convocatorias.`,
        tag: `rev-${l.eventId}`,
      });
      sent.push(`valorar:${l.id}`);
    }
  }

  return sent;
}

let started = false;

/** Arranca la comprobación periódica (una vez por proceso). */
export function startReminderLoop() {
  if (started) return;
  started = true;
  const tick = () =>
    runReminders().catch((e) => console.error("avisos automáticos", e));
  setTimeout(tick, 30_000);
  setInterval(tick, REMINDERS.INTERVAL_MS).unref?.();
}
