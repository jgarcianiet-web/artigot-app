import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { formatDate, isLeadRole, LEAD_ROLES, ROLE_LABEL, type Role } from "./domain";
import { later } from "./later";
import { notify } from "./push";
import { computeScores } from "./scoring";

/**
 * Grupos de los eventos grandes: cada grupo tiene su maître o camarero responsable y su hora de entrada.
 * Los mozos van aparte (con la hora de descarga) y nunca entran en un grupo.
 */

/** Para incluir el grupo con quien lo dirige (maître o camarero responsable confirmado). */
export const GROUP_WITH_LEAD = {
  include: {
    assignments: {
      where: { status: "CONFIRMADO", role: { in: [...LEAD_ROLES] } },
      select: { role: true, worker: { select: { name: true, phone: true } } },
    },
  },
} satisfies Prisma.EventGroupDefaultArgs;

export type GroupWithLead = {
  name: string;
  callTime: string | null;
  assignments: { role: string; worker: { name: string; phone: string | null } }[];
};

/** «Maître: Rosa Blanco» o «Responsable: …» del grupo (o null si aún no tiene). */
export function groupLead(g: GroupWithLead) {
  const l = g.assignments.find((a) => a.role === "MAITRE") ?? g.assignments[0];
  return l ? { label: ROLE_LABEL[l.role as Role], name: l.worker.name, phone: l.worker.phone } : null;
}

export const groupable = (role: string) => role !== "MOZO";

type Member = { id: string; workerId: string; role: string; status: string; groupId: string | null };

/** Grupo con más hueco: primero los que no llegan a lo que necesitan, y entre ellos el más vacío. */
function emptiest(groups: { id: string; need: number }[], count: Map<string, number>) {
  return [...groups].sort((a, b) => {
    const fa = (count.get(a.id) ?? 0) / Math.max(a.need, 1);
    const fb = (count.get(b.id) ?? 0) / Math.max(b.need, 1);
    return fa - fb || (count.get(a.id) ?? 0) - (count.get(b.id) ?? 0);
  })[0];
}

/**
 * Coloca al camarero que acaba de aceptar en el grupo que más lo necesita (si el evento tiene grupos y aún no está
 * en ninguno). A los maîtres y responsables los asigna RRHH: el que no tiene grupo es el maître general del evento.
 */
export async function placeInGroup(assignmentId: string) {
  const a = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { event: { include: { groups: { orderBy: { position: "asc" } }, assignments: { where: { status: { in: ["CONVOCADO", "CONFIRMADO"] } } } } } },
  });
  if (!a || a.groupId || !groupable(a.role) || isLeadRole(a.role) || !a.event.groups.length) return;
  const others = a.event.assignments.filter((x) => x.id !== a.id && x.groupId && x.status === "CONFIRMADO");
  const count = new Map<string, number>();
  for (const x of others) if (!isLeadRole(x.role)) count.set(x.groupId!, (count.get(x.groupId!) ?? 0) + 1);
  const target = emptiest(a.event.groups, count)?.id;
  if (!target) return;
  await db.assignment.update({ where: { id: a.id }, data: { groupId: target } });
  notifyGroupChange([a.id]);
}

/**
 * Reparte a los camareros entre los grupos. Con `all` se rehace el reparto completo; si no, solo se coloca a quien
 * aún no tiene grupo. Se reparten por puntuación alternando grupos (para que cada grupo tenga gente con
 * experiencia) y respetando lo que necesita cada uno. Los maîtres y responsables no se tocan: los elige RRHH.
 * Devuelve cuántas personas han cambiado de grupo.
 */
export async function distribute(eventId: string, all: boolean) {
  const ev = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { groups: { orderBy: { position: "asc" } }, assignments: { where: { status: { in: ["CONVOCADO", "CONFIRMADO"] } } } },
  });
  if (!ev.groups.length) return 0;
  const members: Member[] = ev.assignments.filter((a) => groupable(a.role) && !isLeadRole(a.role));
  const next = new Map(members.map((m) => [m.id, all ? null : m.groupId]));
  const scores = await computeScores(members.map((m) => m.workerId), ev.date);
  const byScore = (x: Member, y: Member) =>
    // Primero los confirmados; después por puntuación
    (x.status === "CONFIRMADO" ? 0 : 1) - (y.status === "CONFIRMADO" ? 0 : 1) || (scores.get(y.workerId)?.score ?? 0) - (scores.get(x.workerId)?.score ?? 0);

  // Camareros: en orden de puntuación, siempre al grupo con más hueco (así se alternan los mejores)
  const count = new Map<string, number>();
  for (const m of members) if (next.get(m.id)) count.set(next.get(m.id)!, (count.get(next.get(m.id)!) ?? 0) + 1);
  for (const m of members.filter((m) => !next.get(m.id)).sort(byScore)) {
    const g = emptiest(ev.groups, count);
    next.set(m.id, g.id);
    count.set(g.id, (count.get(g.id) ?? 0) + 1);
  }

  const changed = members.filter((m) => next.get(m.id) !== m.groupId);
  for (const m of changed) await db.assignment.update({ where: { id: m.id }, data: { groupId: next.get(m.id) ?? null } });
  notifyGroupChange(changed.filter((m) => m.status === "CONFIRMADO").map((m) => m.id));
  return changed.length;
}

/** Avisa a cada persona confirmada de su grupo, quién lo dirige y su hora de entrada. */
export function notifyGroupChange(assignmentIds: string[]) {
  if (!assignmentIds.length) return;
  later(async () => {
    const list = await db.assignment.findMany({
      where: { id: { in: assignmentIds }, status: "CONFIRMADO" },
      include: { event: true, group: GROUP_WITH_LEAD },
    });
    for (const a of list) {
      const body = a.group
        ? groupLine(a.group, a.event.startTime, a.role)
        : isLeadRole(a.role)
          ? `Eres el ${ROLE_LABEL[a.role as Role].toLowerCase()} general del evento: supervisas todos los grupos. Entrada ${a.event.startTime}.`
          : `Ya no estás en ningún grupo. Tu hora de entrada es la del evento: ${a.event.startTime}.`;
      await notify({
        workerIds: [a.workerId],
        workerUrl: `/app/eventos/${a.eventId}`,
        title: `${a.event.name} · ${formatDate(a.event.date)}`,
        body,
        tag: `grupo-${a.id}`,
      });
    }
  });
}

/** «Grupo 2 · Maître: Rosa Blanco · Entrada 17:30» */
export function groupLine(g: GroupWithLead, eventStart: string, role: string | null = null) {
  const lead = groupLead(g);
  const leadText = lead && !(role && isLeadRole(role)) ? ` · ${lead.label}: ${lead.name}` : "";
  return `${g.name}${leadText} · Entrada ${g.callTime || eventStart}`;
}

/** Maître (o responsable) general del evento con grupos: quien dirige y no está en ningún grupo. */
export async function generalLead(eventId: string) {
  const l = await db.assignment.findFirst({
    where: { eventId, status: "CONFIRMADO", role: { in: [...LEAD_ROLES] }, groupId: null, event: { groups: { some: {} } } },
    orderBy: { role: "asc" }, // MAITRE antes que RESPONSABLE
    select: { role: true, worker: { select: { name: true } } },
  });
  return l ? `${ROLE_LABEL[l.role as Role]} general: ${l.worker.name}` : null;
}
