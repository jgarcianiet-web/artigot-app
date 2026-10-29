"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelPending, createSignRequest, remindSignRequest } from "@/lib/signRequests";

export async function sendSignRequest(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return "Adjunta el documento en PDF.";
  let id: string;
  try {
    const { request, recipients } = await createSignRequest(by, {
      title: String(form.get("title") ?? ""),
      message: String(form.get("message") ?? "") || null,
      file,
      workerIds: form.getAll("members").map(String),
    });
    await auditAdmin(by, "Documento", "Enviado a firmar", `«${request.title}» enviado a firmar a ${recipients} ${recipients === 1 ? "persona" : "personas"}`, { entityId: request.id });
    id = request.id;
  } catch (e) {
    return (e as Error).message;
  }
  revalidatePath("/admin/documentos/firmar");
  redirect(`/admin/documentos/firmar/${id}`);
}

export async function remindSignAction(requestId: string) {
  const by = await requireAdmin();
  const n = await remindSignRequest(requestId);
  const r = await db.signRequest.findUnique({ where: { id: requestId }, select: { title: true } });
  await auditAdmin(by, "Documento", "Recordatorio", `«${r?.title}»: recordatorio a ${n} ${n === 1 ? "persona" : "personas"} sin firmar`, { entityId: requestId });
  revalidatePath(`/admin/documentos/firmar/${requestId}`);
}

export async function cancelSignAction(requestId: string) {
  const by = await requireAdmin();
  const r = await db.signRequest.findUnique({ where: { id: requestId }, select: { title: true } });
  const { cancelled, deleted } = await cancelPending(requestId);
  await auditAdmin(by, "Documento", "Anulado", `«${r?.title}»: anuladas ${cancelled} firmas pendientes${deleted ? " (envío borrado)" : ""}`, { entityId: requestId });
  revalidatePath("/admin/documentos/firmar");
  redirect(deleted ? "/admin/documentos/firmar" : `/admin/documentos/firmar/${requestId}`);
}
