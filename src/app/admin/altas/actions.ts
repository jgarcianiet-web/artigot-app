"use server";

import { revalidatePath } from "next/cache";
import { newAccessCode, phoneKey, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { analyzeEmployments, CONTRACT_TYPES, END_REASONS, type EmploymentImportRow } from "@/lib/employment";
import { auditAdmin } from "@/lib/audit";

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const refresh = (workerId?: string) => {
  revalidatePath("/admin/altas");
  revalidatePath("/admin");
  if (workerId) revalidatePath(`/admin/personal/${workerId}`);
};

/** ¿Se solapa con otra alta del mismo trabajador? */
async function overlap(workerId: string, start: string, end: string | null, exceptId?: string) {
  const others = await db.employment.findMany({ where: { workerId, id: exceptId ? { not: exceptId } : undefined } });
  return others.find((e) => e.startDate <= (end ?? "9999-12-31") && (e.endDate ?? "9999-12-31") >= start);
}

export async function saveEmployment(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const id = get("id") || undefined;
  const workerId = get("workerId");
  const startDate = get("startDate");
  const endDate = get("endDate") || null;
  const contractType = get("contractType");
  const hours = get("hoursPerWeek") ? Number(get("hoursPerWeek").replace(",", ".")) : null;
  if (!workerId) return "Elige a la persona.";
  if (!isDate(startDate)) return "Indica la fecha de alta.";
  if (endDate && (!isDate(endDate) || endDate < startDate)) return "La fecha de baja no puede ser anterior al alta.";
  if (!(CONTRACT_TYPES as readonly string[]).includes(contractType)) return "Elige el tipo de contrato.";
  if (hours !== null && !(hours > 0 && hours <= 40)) return "Las horas semanales tienen que estar entre 0 y 40.";
  const clash = await overlap(workerId, startDate, endDate, id);
  if (clash) return `Ya tiene un alta que coincide (desde el ${formatDate(clash.startDate)}${clash.endDate ? ` hasta el ${formatDate(clash.endDate)}` : ""}).`;
  const data = { workerId, startDate, endDate, contractType, category: get("category") || null, hoursPerWeek: hours, notes: get("notes") || null };
  if (id) await db.employment.update({ where: { id }, data });
  else await db.employment.create({ data: { ...data, createdBy: by } });
  const wn = await db.worker.findUnique({ where: { id: workerId }, select: { name: true } });
  await auditAdmin(by, "Alta S. S.", id ? "Modificada" : "Alta", `${wn?.name}: alta ${startDate}${endDate ? ` → baja ${endDate}` : ""} (${contractType})`, { entityId: workerId });
  refresh(workerId);
  return id ? "Alta actualizada." : "Alta registrada.";
}

export async function endEmployment(id: string, _prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const endDate = String(form.get("endDate") ?? "");
  const endReason = String(form.get("endReason") ?? "");
  const e = await db.employment.findUnique({ where: { id } });
  if (!e) return "No existe.";
  if (!isDate(endDate) || endDate < e.startDate) return "La fecha de baja no puede ser anterior al alta.";
  if (!(END_REASONS as readonly string[]).includes(endReason)) return "Elige el motivo de la baja.";
  const clash = await overlap(e.workerId, e.startDate, endDate, id);
  if (clash) return "Coincide con otra alta de esta persona.";
  await db.employment.update({ where: { id }, data: { endDate, endReason, endReported: false } });
  const wn = await db.worker.findUnique({ where: { id: e.workerId }, select: { name: true } });
  await auditAdmin(by, "Alta S. S.", "Baja", `${wn?.name}: baja ${endDate} (${endReason})`, { entityId: e.workerId });
  refresh(e.workerId);
  return "Baja registrada.";
}

export async function toggleReported(id: string, which: "start" | "end") {
  const by = await requireAdmin();
  const e = await db.employment.findUniqueOrThrow({ where: { id }, include: { worker: { select: { name: true } } } });
  const now = which === "start" ? !e.startReported : !e.endReported;
  await auditAdmin(by, "Alta S. S.", "Comunicación RED", `${e.worker.name}: ${which === "start" ? `alta del ${e.startDate}` : `baja del ${e.endDate}`} ${now ? "comunicada" : "marcada como no comunicada"}`, { entityId: e.workerId });
  await db.employment.update({ where: { id }, data: which === "start" ? { startReported: !e.startReported } : { endReported: !e.endReported } });
  refresh(e.workerId);
}

/** Marca como comunicadas a la Seguridad Social todas las bajas (o altas) de un día. */
export async function markDayReported(day: string, which: "start" | "end") {
  const by = await requireAdmin();
  if (!isDate(day)) return;
  const r = await db.employment.updateMany({
    where: which === "end" ? { endDate: day, endReported: false } : { startDate: day, startReported: false },
    data: which === "end" ? { endReported: true } : { startReported: true },
  });
  if (r.count) await auditAdmin(by, "Alta S. S.", "Comunicación RED", `${r.count} ${which === "end" ? "bajas" : "altas"} del ${day} marcadas como comunicadas`);
  refresh();
}

export async function deleteEmployment(id: string) {
  const by = await requireAdmin();
  const e = await db.employment.delete({ where: { id }, include: { worker: { select: { name: true } } } });
  await auditAdmin(by, "Alta S. S.", "Borrada", `${e.worker.name}: borrada el alta del ${e.startDate}${e.endDate ? ` (baja ${e.endDate})` : ""}`, { entityId: e.workerId });
  refresh(e.workerId);
}

/** Alta de un día (o dos si el evento pasa de medianoche) para el personal confirmado que no la tiene. */
// ---------- Importación ----------

export type ImportState = { rows?: EmploymentImportRow[]; columns?: { header: string; field: string | null }[]; error?: string; done?: string } | null;

export async function importEmployments(_prev: ImportState, form: FormData): Promise<ImportState> {
  const by = await requireAdmin();
  const res = await analyzeEmployments(form.get("file") as File);
  if ("error" in res) return { error: res.error };
  if (form.get("mode") !== "commit") return res;
  let created = 0, updated = 0, newWorkers = 0;
  for (const r of res.rows) {
    if (r.status === "error" || !r.startDate) continue;
    let workerId = r.workerId;
    if (!workerId && r.createWorker) {
      const key = phoneKey(r.createWorker.phone);
      const existing = await db.worker.findUnique({ where: { phoneKey: key } });
      workerId = existing?.id ?? (await db.worker.create({
        data: {
          name: r.name, phone: r.createWorker.phone, phoneKey: key, role: r.createWorker.role, roles: [r.createWorker.role],
          dni: r.dni, nss: r.createWorker.nss, accessCode: newAccessCode(),
        },
      })).id;
      if (!existing) newWorkers++;
    }
    if (!workerId) continue;
    const data = {
      endDate: r.endDate, contractType: r.contractType, category: r.category, hoursPerWeek: r.hoursPerWeek,
      endReason: r.endDate ? r.endReason ?? "Fin de contrato" : null, notes: r.notes,
      // Lo que ya estaba en el Excel se entiende comunicado a la Seguridad Social
      startReported: true, endReported: !!r.endDate,
    };
    const found = await db.employment.findFirst({ where: { workerId, startDate: r.startDate } });
    if (found) {
      await db.employment.update({ where: { id: found.id }, data });
      updated++;
    } else {
      await db.employment.create({ data: { workerId, startDate: r.startDate, createdBy: by, ...data } });
      created++;
    }
  }
  await auditAdmin(by, "Alta S. S.", "Importación", `Importación de altas y bajas desde Excel: ${created} nuevas, ${updated} actualizadas, ${newWorkers} personas nuevas`);
  refresh();
  return { done: `Importadas ${created} altas nuevas y ${updated} actualizadas${newWorkers ? `; ${newWorkers} personas nuevas añadidas a Personal` : ""}.` };
}
