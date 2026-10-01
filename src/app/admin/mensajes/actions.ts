"use server";

import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit";
import { currentAdmin } from "@/lib/auth";
import { createGroup, directRoom } from "@/lib/staffChat";

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
