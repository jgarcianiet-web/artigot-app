"use server";

import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit";
import { currentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createGroup, directRoom } from "@/lib/staffChat";
import { deleteDm } from "@/lib/workerChat";

async function me() {
  const a = await currentAdmin();
  if (!a) redirect("/login");
  return a;
}

export async function openDirect(form: FormData) {
  const a = await me();
  const room = await directRoom(a, String(form.get("adminId") ?? ""));
  redirect(`/admin/mensajes/${room.id}`);
}

export async function newGroup(_prev: string | null, form: FormData) {
  const a = await me();
  let id: string;
  try {
    const room = await createGroup(a, String(form.get("name") ?? ""), form.getAll("members").map(String));
    await auditAdmin(a.name, "Mensajes", "Grupo creado", `Grupo «${room.name}» creado`);
    id = room.id;
  } catch (e) {
    return (e as Error).message;
  }
  redirect(`/admin/mensajes/${id}`);
}

/** Abre (o empieza) la conversación con un trabajador. */
export async function openWorkerChat(form: FormData) {
  await me();
  const workerId = String(form.get("workerId") ?? "");
  if (workerId) redirect(`/admin/mensajes/personal/${workerId}`);
}

export async function deleteWorkerChat(form: FormData) {
  const a = await me();
  const workerId = String(form.get("workerId") ?? "");
  const w = await db.worker.findUnique({ where: { id: workerId }, select: { name: true } });
  if (w) {
    const n = await deleteDm(workerId);
    await auditAdmin(a.name, "Mensajes", "Conversación eliminada", `Chat con ${w.name} eliminado (${n} mensajes)`, { entityId: workerId });
  }
  redirect("/admin/mensajes?ver=personal");
}
