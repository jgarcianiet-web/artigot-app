import { madridTime } from "./clockRules";
import { db } from "./db";
import { callTime, formatDate, isRole, type Role } from "./domain";
import { later } from "./later";
import { notify } from "./push";
import { autoReplace } from "./staffing";

/**
 * No asistencia de alguien que ya había confirmado. Siempre con motivo:
 * - Con más de WITHDRAW_FREE_HOURS horas hasta su hora de entrada, se cancela en el momento.
 * - Con menos, queda como solicitud y la aprueba (o no) RRHH; mientras tanto sigue confirmado.
 */
export const WITHDRAW_FREE_HOURS = 24;

type WithEvent = { role: string; event: { date: string; startTime: string; unloadTime: string | null }; group?: { callTime: string | null } | null };

/** Hora de entrada de esta persona (su citación o la de su grupo). */
export const callInstant = (a: WithEvent) => madridTime(a.event.date, callTime(a.event, a.role, a.group));

/** ¿Puede cancelar sin aprobación de RRHH? */
export const canWithdrawFreely = (a: WithEvent, now = new Date()) => callInstant(a).getTime() - now.getTime() > WITHDRAW_FREE_HOURS * 3_600_000;

/** Da de baja a quien no va: deja su sitio (y su grupo), cuenta como retirada y se busca sustituto. */
export async function applyWithdrawal(assignmentId: string, reason: string, who: string) {
  const a = await db.assignment.update({
    where: { id: assignmentId },
    data: { status: "RECHAZADO", respondedAt: new Date(), withdrew: true, groupId: null, withdrawReason: reason, withdrawRequestedAt: null },
    include: { event: true, worker: { select: { name: true } } },
  });
  if (isRole(a.role)) later(() => autoReplace(a.eventId, a.role as Role, who));
  return a;
}

/** RRHH aprueba la solicitud: se cancela su asistencia y se le avisa. */
export async function approveWithdrawal(assignmentId: string) {
  const req = await db.assignment.findUnique({ where: { id: assignmentId }, select: { status: true, withdrawRequestedAt: true, withdrawReason: true, worker: { select: { name: true } } } });
  if (!req || req.status !== "CONFIRMADO" || !req.withdrawRequestedAt) return null;
  const a = await applyWithdrawal(assignmentId, req.withdrawReason ?? "", req.worker.name);
  later(() =>
    notify({
      workerIds: [a.workerId],
      workerUrl: "/app",
      title: "Baja aprobada",
      body: `RRHH ha aprobado que no vayas a ${a.event.name} (${formatDate(a.event.date)}).`,
      tag: `baja-${a.id}`,
      emailFallback: true,
    }),
  );
  return a;
}

/** RRHH no aprueba la solicitud: sigue confirmado y se le avisa. */
export async function rejectWithdrawal(assignmentId: string) {
  const req = await db.assignment.findUnique({ where: { id: assignmentId }, select: { status: true, withdrawRequestedAt: true } });
  if (!req || req.status !== "CONFIRMADO" || !req.withdrawRequestedAt) return null;
  const a = await db.assignment.update({
    where: { id: assignmentId },
    data: { withdrawRequestedAt: null },
    include: { event: true, worker: { select: { name: true } } },
  });
  later(() =>
    notify({
      workerIds: [a.workerId],
      workerUrl: `/app/eventos/${a.eventId}`,
      title: "Baja no aprobada",
      body: `RRHH no ha aprobado tu baja en ${a.event.name} (${formatDate(a.event.date)}): sigues confirmado. Si tienes dudas, habla con RRHH.`,
      tag: `baja-${a.id}`,
      emailFallback: true,
    }),
  );
  return a;
}
