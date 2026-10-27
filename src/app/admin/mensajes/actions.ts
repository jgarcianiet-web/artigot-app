"use server";

import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit";
import { currentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createGroup, directRoom } from "@/lib/staffChat";
import { deleteDm } from "@/lib/workerChat";
import { deleteGroup, saveGroup } from "@/lib/workerGroups";

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

/** Crear o editar un grupo con el personal. */
export async function saveGroupAction(_prev: string | null, form: FormData) {
  const a = await me();
  const id = String(form.get("id") ?? "") || undefined;
  let saved: { id: string; members: number };
  try {
    saved = await saveGroup(a.name, { id, name: String(form.get("name") ?? ""), onlyStaff: form.get("onlyStaff") === "on", workerIds: form.getAll("members").map(String) });
  } catch (e) {
    return (e as Error).message;
  }
  await auditAdmin(a.name, "Mensajes", id ? "Grupo editado" : "Grupo creado", `Grupo «${String(form.get("name")).trim()}» con ${saved.members} personas`, { entityId: saved.id });
  redirect(`/admin/mensajes/grupos/${saved.id}`);
}

export async function deleteGroupAction(form: FormData) {
  const a = await me();
  const g = await deleteGroup(String(form.get("groupId") ?? ""));
  if (g) await auditAdmin(a.name, "Mensajes", "Grupo eliminado", `Grupo «${g.name}» eliminado con sus mensajes`, { entityId: g.id });
  redirect("/admin/mensajes?ver=personal");
}
