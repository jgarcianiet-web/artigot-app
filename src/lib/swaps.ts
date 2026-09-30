import { after } from "next/server";
import { db } from "./db";
import { formatDate, ROLE_LABEL, type Role, today } from "./domain";
import { notify } from "./push";
import { candidatesFor } from "./staffing";

/**
 * Intercambio de turno:
 *  1. Quien está confirmado y no puede ir propone a un compañero libre que puede hacer su puesto.
 *  2. El compañero acepta o rechaza desde su app.
 *  3. RRHH aprueba con un clic: el compañero queda confirmado y el turno original se cancela
 *     sin penalizar a quien lo cedió (no cuenta como retirada).
 */
export const OPEN_SWAP = ["PROPUESTO", "ACEPTADO"];

/** Compañeros que pueden cubrir el turno: libres ese día y capacitados para ese puesto. */
export async function swapPartners(assignment: { eventId: string; role: string; event: { id: string; date: string } }) {
  return (await candidatesFor(assignment.event))[assignment.role as Role] ?? [];
}

type Result = { ok: boolean; message: string };

export async function proposeSwap(workerId: string, assignmentId: string, toWorkerId: string, message: string | null): Promise<Result> {
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, include: { event: true, worker: true } });
  if (!a || a.workerId !== workerId) return { ok: false, message: "No autorizado" };
  if (a.status !== "CONFIRMADO" || a.event.date < today() || a.checkIn) return { ok: false, message: "Solo se pueden cambiar turnos confirmados que aún no han empezado." };
  if (await db.swapRequest.findFirst({ where: { assignmentId, status: { in: OPEN_SWAP } } })) {
    return { ok: false, message: "Ya tienes un cambio en curso para este turno." };
  }
  const partners = await swapPartners(a);
  const partner = partners.find((p) => p.id === toWorkerId);
  if (!partner) return { ok: false, message: "Esa persona no está disponible para ese puesto ese día." };
  await db.swapRequest.create({
    data: { assignmentId, eventId: a.eventId, fromWorkerId: workerId, toWorkerId, message: message?.slice(0, 300) || null },
  });
  after(() =>
    notify({
      workerIds: [toWorkerId],
      workerUrl: "/app",
      title: "¿Cubres un turno?",
      body: `${a.worker.name} te propone ir en su lugar a ${a.event.name} (${formatDate(a.event.date)}) como ${ROLE_LABEL[a.role as Role]?.toLowerCase()}.`,
      tag: `swap-${assignmentId}`,
    }),
  );
  return { ok: true, message: `Propuesta enviada a ${partner.name}. Cuando acepte, RRHH la aprobará.` };
}

/** El compañero acepta o rechaza la propuesta. */
export async function answerSwap(workerId: string, swapId: string, accept: boolean) {
  const s = await db.swapRequest.findUnique({
    where: { id: swapId },
    include: { event: true, fromWorker: true, toWorker: true },
  });
  if (!s || s.toWorkerId !== workerId || s.status !== "PROPUESTO") return;
  await db.swapRequest.update({ where: { id: swapId }, data: { status: accept ? "ACEPTADO" : "RECHAZADO" } });
  after(async () => {
    if (accept) {
      await notify({
        admins: true,
        adminUrl: "/admin",
        title: "🔁 Cambio de turno para aprobar",
        body: `${s.toWorker.name} cubriría a ${s.fromWorker.name} en ${s.event.name} (${formatDate(s.event.date)}).`,
        tag: `swap-${s.id}`,
      });
    } else {
      await notify({
        workerIds: [s.fromWorkerId],
        workerUrl: `/app/eventos/${s.eventId}/cambio`,
        title: "Cambio de turno rechazado",
        body: `${s.toWorker.name} no puede cubrir tu turno en ${s.event.name}. Puedes proponérselo a otra persona.`,
        tag: `swap-${s.assignmentId}`,
      });
    }
  });
}

/** RRHH aprueba el cambio: el compañero entra confirmado y el turno original se cancela sin penalizar. */
export async function approveSwap(swapId: string, adminName: string): Promise<Result> {
  const s = await db.swapRequest.findUnique({
    where: { id: swapId },
    include: { event: true, assignment: true, fromWorker: true, toWorker: true },
  });
  if (!s || s.status !== "ACEPTADO") return { ok: false, message: "Este cambio ya no está pendiente." };
  if (s.assignment.status !== "CONFIRMADO" || s.assignment.checkIn) return { ok: false, message: "El turno original ya no está confirmado." };
  const stillFree = (await swapPartners({ ...s.assignment, event: s.event })).some((p) => p.id === s.toWorkerId);
  if (!stillFree) {
    await db.swapRequest.update({ where: { id: swapId }, data: { status: "RECHAZADO", decidedBy: adminName } });
    return { ok: false, message: `${s.toWorker.name} ya no está libre ese día; el cambio se ha anulado.` };
  }
  await db.$transaction([
    db.assignment.update({
      where: { id: s.assignmentId },
      data: { status: "CANCELADO", respondedAt: new Date(), notes: `Cambio de turno con ${s.toWorker.name} (aprobado por ${adminName})` },
    }),
    db.assignment.upsert({
      where: { eventId_workerId: { eventId: s.eventId, workerId: s.toWorkerId } },
      create: { eventId: s.eventId, workerId: s.toWorkerId, role: s.assignment.role, status: "CONFIRMADO", respondedAt: new Date(), notes: `Cubre a ${s.fromWorker.name}` },
      update: { role: s.assignment.role, status: "CONFIRMADO", respondedAt: new Date(), notes: `Cubre a ${s.fromWorker.name}` },
    }),
    db.swapRequest.update({ where: { id: swapId }, data: { status: "APROBADO", decidedBy: adminName } }),
  ]);
  after(async () => {
    await notify({
      workerIds: [s.toWorkerId],
      workerUrl: `/app/eventos/${s.eventId}`,
      title: "Cambio aprobado",
      body: `Vas a ${s.event.name} (${formatDate(s.event.date)}) en lugar de ${s.fromWorker.name}.`,
      tag: `swap-${s.id}`,
    });
    await notify({
      workerIds: [s.fromWorkerId],
      workerUrl: "/app",
      title: "Cambio aprobado",
      body: `${s.toWorker.name} irá en tu lugar a ${s.event.name}. Ya no tienes ese turno.`,
      tag: `swap-${s.id}`,
    });
  });
  return { ok: true, message: "Cambio aprobado." };
}

export async function rejectSwap(swapId: string, adminName: string) {
  const s = await db.swapRequest.findUnique({ where: { id: swapId }, include: { event: true } });
  if (!s || !OPEN_SWAP.includes(s.status)) return;
  await db.swapRequest.update({ where: { id: swapId }, data: { status: "RECHAZADO", decidedBy: adminName } });
  after(() =>
    notify({
      workerIds: [s.fromWorkerId, s.toWorkerId],
      workerUrl: "/app",
      title: "Cambio de turno no aprobado",
      body: `RRHH no ha aprobado el cambio para ${s.event.name}. El turno sigue como estaba.`,
      tag: `swap-${s.id}`,
    }),
  );
}
