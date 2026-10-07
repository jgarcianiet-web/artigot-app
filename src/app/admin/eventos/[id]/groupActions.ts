"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { distribute, groupable, notifyGroupChange } from "@/lib/groups";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const done = (eventId: string) => {
  revalidatePath(`/admin/eventos/${eventId}`);
  revalidatePath("/app", "layout");
};

/** Crea varios grupos de golpe («Grupo 1», «Grupo 2»…) repartiendo los camareros que necesita el evento. */
export async function createGroups(eventId: string, _prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const n = Number(form.get("count"));
  const callTime = String(form.get("callTime") ?? "").trim();
  if (!Number.isInteger(n) || n < 1 || n > 30) return "Indica cuántos grupos (de 1 a 30).";
  if (callTime && !TIME.test(callTime)) return "La hora de entrada no es válida.";
  const ev = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { groups: true } });
  const start = ev.groups.length;
  const each = Math.ceil(ev.needCamareros / n);
  await db.eventGroup.createMany({
    data: Array.from({ length: n }, (_, i) => ({ eventId, name: `Grupo ${start + i + 1}`, callTime: callTime || null, need: each, position: start + i })),
  });
  await auditAdmin(by, "Evento", "Grupos", `${ev.name}: ${n} grupos nuevos`, { entityId: eventId });
  done(eventId);
  return null;
}

/** Cambia nombre, hora de entrada o camareros que necesita un grupo; si cambia la hora, se avisa al grupo. */
export async function updateGroup(groupId: string, _prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const callTime = String(form.get("callTime") ?? "").trim();
  const need = Number(form.get("need") || 0);
  if (!name) return "Ponle un nombre al grupo.";
  if (callTime && !TIME.test(callTime)) return "La hora de entrada no es válida.";
  if (!Number.isInteger(need) || need < 0 || need > 500) return "Número de camareros no válido.";
  const before = await db.eventGroup.findUniqueOrThrow({ where: { id: groupId }, include: { event: { select: { name: true } } } });
  const g = await db.eventGroup.update({ where: { id: groupId }, data: { name, callTime: callTime || null, need } });
  if (before.callTime !== g.callTime || before.name !== g.name) {
    const members = await db.assignment.findMany({ where: { groupId, status: "CONFIRMADO" }, select: { id: true } });
    notifyGroupChange(members.map((m) => m.id));
    await auditAdmin(by, "Evento", "Grupos", `${before.event.name}: ${before.name} → ${g.name}, entrada ${before.callTime ?? "la del evento"} → ${g.callTime ?? "la del evento"}`, { entityId: g.eventId });
  }
  done(g.eventId);
  return "Guardado.";
}

/** Borra un grupo: su gente queda sin grupo (con la hora del evento) y se le avisa. */
export async function deleteGroup(groupId: string) {
  const by = await requireAdmin();
  const g = await db.eventGroup.findUniqueOrThrow({ where: { id: groupId }, include: { event: { select: { name: true } } } });
  const members = await db.assignment.findMany({ where: { groupId }, select: { id: true } });
  await db.eventGroup.delete({ where: { id: groupId } });
  notifyGroupChange(members.map((m) => m.id));
  await auditAdmin(by, "Evento", "Grupos", `${g.event.name}: ${g.name} borrado`, { entityId: g.eventId });
  done(g.eventId);
}

/** Mueve a una persona a otro grupo (o la deja sin grupo) y le avisa. */
export async function moveToGroup(assignmentId: string, groupId: string | null) {
  await requireAdmin();
  const a = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
  if (!groupable(a.role)) return;
  if (groupId && !(await db.eventGroup.findFirst({ where: { id: groupId, eventId: a.eventId } }))) return;
  if (a.groupId === groupId) return;
  await db.assignment.update({ where: { id: a.id }, data: { groupId } });
  notifyGroupChange([a.id]);
  done(a.eventId);
}

/** Reparte a quien no tiene grupo, o rehace el reparto completo. */
export async function distributeGroups(eventId: string, all: boolean) {
  const by = await requireAdmin();
  const n = await distribute(eventId, all);
  await auditAdmin(by, "Evento", "Grupos", `Reparto ${all ? "completo" : "de quien no tenía grupo"}: ${n} personas colocadas`, { entityId: eventId });
  done(eventId);
}
