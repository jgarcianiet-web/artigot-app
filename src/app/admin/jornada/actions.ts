"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { today } from "@/lib/domain";
import { generateTimeRecords, monthLabel } from "@/lib/timeRecord";

export async function generateTimeRecordsAction(month: string, _prev: string | null) {
  const by = await requireAdmin();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > today().slice(0, 7)) return "Mes no válido.";
  const r = await generateTimeRecords(month, by);
  await auditAdmin(by, "Registro de jornada", "Enviado a firmar", `${monthLabel(month)}: ${r.created} nuevos, ${r.updated} actualizados, ${r.signed} ya firmados`);
  revalidatePath("/admin/jornada");
  if (!r.total) return "No hay servicios confirmados ese mes.";
  return `${r.created} registros enviados a firmar${r.updated ? `, ${r.updated} actualizados` : ""}${r.signed ? `; ${r.signed} ya estaban firmados y no se tocan` : ""}.`;
}
