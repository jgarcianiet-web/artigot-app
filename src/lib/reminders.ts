import { Prisma } from "@prisma/client";
import { clockWindow, hhmm, madridTime } from "./clockRules";
import { db } from "./db";
import { mailEnabled, sendMail } from "./mail";
import { addDays, appUrl, callTime, formatDate, isLeadRole, LEAD_ROLES, ROLE_LABEL, type Role } from "./domain";
import { notify } from "./push";
import { REVIEW_DAYS } from "./reviews";
import { DOC_LABEL, DOC_WARN_DAYS } from "./staff";
import { generateTimeRecords, monthLabel, shiftMonth } from "./timeRecord";
import { audit } from "./audit";
import { incompleteWorkers, missingText } from "./completeness";
import { backupNow } from "./backup";
import { migrateFilesToStorage, sweepOrphanFiles } from "./files";
import { storageEnabled } from "./storage";

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
  /** Hora (Madrid) del recordatorio de datos incompletos y cada cuántos días se repite */
  DATA_REMINDER_HOUR: "11:00",
  DATA_EVERY_DAYS: 3,
  /** Hora (Madrid) del resumen de documentos por revisar para RRHH */
  DOCS_DIGEST_HOUR: "09:00",
  /** Hora (Madrid) de la copia de seguridad nocturna */
  BACKUP_HOUR: "03:00",
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
        body: `Citación a las ${callTime(a.event, a.role)} en ${a.event.venue}.${a.event.meetingPoint ? ` Punto de encuentro: ${a.event.meetingPoint}${a.event.meetingTime ? ` a las ${a.event.meetingTime}` : ""}.` : ""}${a.event.notes ? " Revisa las notas del evento." : ""}`,
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

  // 5. Documentos que caducan: aviso 30 días antes y el día que caducan (al trabajador y a RRHH)
  const docs = await db.workerDocument.findMany({
    where: { expiresAt: { not: null, lte: addDays(today, DOC_WARN_DAYS) }, worker: { active: true } },
    include: { worker: { select: { id: true, name: true } } },
  });
  for (const d of docs) {
    const expired = d.expiresAt! <= today;
    const key = `${expired ? "doc-caducado" : "doc-caduca"}:${d.id}`;
    if (!(await claim(key))) continue;
    const what = DOC_LABEL[d.type] ?? "Un documento";
    await notify({
      workerIds: [d.workerId],
      workerUrl: "/app/perfil",
      title: expired ? "Documento caducado" : "Documento a punto de caducar",
      body: `${what} ${expired ? "ha caducado" : `caduca el ${formatDate(d.expiresAt!)}`}. Sube el nuevo desde tu perfil.`,
      tag: `doc-${d.id}`,
    });
    await notify({
      admins: true,
      adminUrl: `/admin/personal/${d.workerId}`,
      title: expired ? "Documento caducado" : "Documento a punto de caducar",
      body: `${d.worker.name}: ${what} ${expired ? "ha caducado" : `caduca el ${formatDate(d.expiresAt!)}`}.`,
      tag: `doc-${d.id}`,
    });
    sent.push(key);
  }

  // 6. Registro de jornada: el día 2 de cada mes (desde las 10:00) se envía a firmar el del mes anterior
  if (Number(today.slice(8)) >= 2 && now >= madridTime(today, REMINDERS.REVIEW_REMINDER_HOUR)) {
    const prev = shiftMonth(today.slice(0, 7), -1);
    if (await claim(`jornada:${prev}`)) {
      const r = await generateTimeRecords(prev, "Automático", { inRequest: false });
      if (r.total) {
        await notify({
          admins: true,
          adminUrl: `/admin/jornada?mes=${prev}`,
          title: "Registro de jornada enviado",
          body: `Se ha enviado a firmar el registro de jornada de ${monthLabel(prev)} a ${r.created} personas.`,
          tag: `jornada-${prev}`,
        });
      }
      sent.push(`jornada:${prev}`);
    }
  }

  // 8. Datos incompletos: recordatorio al trabajador cada 3 días (cada día si tiene servicio en la próxima semana)
  if (now >= madridTime(today, REMINDERS.DATA_REMINDER_HOUR)) {
    const dayNumber = Math.floor(new Date(`${today}T12:00:00Z`).getTime() / 864e5);
    for (const w of await incompleteWorkers()) {
      const key = w.upcoming ? `datos:${w.id}:${today}` : `datos:${w.id}:c${Math.floor(dayNumber / REMINDERS.DATA_EVERY_DAYS)}`;
      if (!(await claim(key))) continue;
      await notify({
        workerIds: [w.id],
        workerUrl: "/app/perfil",
        title: w.upcoming ? "Completa tus datos antes del servicio" : "Completa tus datos",
        body: `Te falta: ${missingText(w.missing)}. Sin ello no podemos darte de alta ni pagarte. Complétalo en tu perfil.`,
        tag: "datos",
      });
      // Quien aún no ha entrado en la app no recibe avisos: se le escribe al email
      if (!w.devices && w.email && mailEnabled()) {
        await sendMail(
          w.email,
          "Completa tus datos en la app de Artigot",
          `Hola ${w.name.split(" ")[0]}, en la app de Artigot te falta: ${missingText(w.missing)}.\nEntra en ${appUrl()} con tu ${w.phone ? "teléfono" : "email"} y tu código de acceso y complétalo en tu perfil. Si no tienes el código, pídeselo a RRHH.`,
        ).catch((e) => console.error("email datos", w.id, e));
      }
      sent.push(key);
    }
  }

  // 9. Resumen diario a RRHH de los documentos por revisar
  if (now >= madridTime(today, REMINDERS.DOCS_DIGEST_HOUR)) {
    const pendingDocs = await db.workerDocument.count({ where: { verified: false, worker: { active: true } } });
    if (pendingDocs && (await claim(`docs-revisar:${today}`))) {
      await notify({
        admins: true,
        adminUrl: "/admin/documentos",
        title: "Documentos por revisar",
        body: `Hay ${pendingDocs} ${pendingDocs === 1 ? "documento" : "documentos"} del personal pendientes de revisar.`,
        tag: "docs-revisar",
      });
      sent.push(`docs-revisar:${today}`);
    }
  }

  // 7. Mantenimiento nocturno (desde las 03:00): archivos al almacén, copia de seguridad y limpieza
  if (now >= madridTime(today, REMINDERS.BACKUP_HOUR) && storageEnabled() && (await claim(`copia:${today}`))) {
    try {
      const m = await migrateFilesToStorage(50, 5 * 60_000);
      const b = await backupNow();
      const orphans = await sweepOrphanFiles();
      await audit("Copia automática", "Sistema", "Copias", "Copia nocturna", `Copia de seguridad ${b.key} (${Math.round(b.size / 1024)} KB)${m.moved ? `; ${m.moved} archivos movidos al almacén` : ""}${orphans ? `; ${orphans} archivos huérfanos borrados` : ""}`);
      sent.push(`copia:${b.key}`);
    } catch (e) {
      console.error("copia nocturna", e);
      await notify({ admins: true, adminUrl: "/admin/ajustes/copias", title: "⚠️ Copia de seguridad fallida", body: `La copia de esta noche no se ha podido hacer: ${(e as Error).message}`, tag: "copia" });
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
