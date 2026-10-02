"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { mailEnabled, sendAccessEmail } from "@/lib/mail";
import { newAccessCode, phoneKey, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isRole } from "@/lib/domain";
import { analyzeFile, type ImportPreview } from "@/lib/importStaff";
import { auditAdmin } from "@/lib/audit";

export type ImportState =
  | { step: "idle" }
  | { step: "error"; error: string }
  | { step: "preview"; preview: ImportPreview }
  | { step: "done"; created: number; updated: number; skipped: number; errors: number; emailed: number; emailError?: string };

function options(form: FormData) {
  const role = String(form.get("defaultRole") ?? "");
  return { defaultRole: isRole(role) ? role : null, updateExisting: form.get("updateExisting") === "1" };
}

/** Paso 1: leer el archivo y mostrar qué se va a hacer con cada fila, sin guardar nada. */
export async function previewImport(_prev: ImportState, form: FormData): Promise<ImportState> {
  await requireAdmin();
  const result = await analyzeFile(form.get("file") as File, options(form));
  if ("error" in result) return { step: "error", error: result.error };
  return { step: "preview", preview: result };
}

/** Paso 2: se vuelve a leer y validar el mismo archivo en el servidor y se guarda. */
export async function commitImport(_prev: ImportState, form: FormData): Promise<ImportState> {
  const by = await requireAdmin();
  const opts = options(form);
  const result = await analyzeFile(form.get("file") as File, opts);
  if ("error" in result) return { step: "error", error: result.error };

  let created = 0;
  let updated = 0;
  const createdIds: string[] = [];
  await db.$transaction(
    async (tx) => {
      for (const r of result.rows) {
        if (r.status === "nuevo") {
          const w = await tx.worker.create({
            data: {
              name: r.name,
              phone: r.phone || null,
              phoneKey: r.phone ? phoneKey(r.phone) : null,
              role: r.role!,
              roles: [r.role!],
              email: r.email,
              dni: r.dni,
              zone: r.zone,
              rating: r.rating ?? 3,
              notes: r.notes,
              accessCode: newAccessCode(),
            },
          });
          createdIds.push(w.id);
          created++;
        } else if (r.status === "actualizar") {
          // Solo se sobrescriben los datos que vienen rellenos en el Excel; el puesto se añade a los que ya puede hacer
          const current = await tx.worker.findUniqueOrThrow({ where: { id: r.existingId }, select: { roles: true, dni: true } });
          // El teléfono solo se cambia si no es de otra persona (al encontrarla por el DNI puede traer otro)
          const key = r.phone ? phoneKey(r.phone) : null;
          const owner = key ? await tx.worker.findUnique({ where: { phoneKey: key }, select: { id: true } }) : null;
          await tx.worker.update({
            where: { id: r.existingId },
            data: {
              name: r.name,
              ...(key && (!owner || owner.id === r.existingId) && { phone: r.phone, phoneKey: key }),
              ...(r.dni && !current.dni && { dni: r.dni }),
              ...(r.roleRaw && r.role && { role: r.role, roles: [...new Set([r.role, ...current.roles])] }),
              ...(r.email && { email: r.email }),
              ...(r.zone && { zone: r.zone }),
              ...(r.rating != null && { rating: r.rating }),
              ...(r.notes && { notes: r.notes }),
            },
          });
          updated++;
        }
      }
    },
    { timeout: 60_000 },
  );
  await auditAdmin(by, "Trabajador", "Importación", `Importación de personal desde Excel: ${created} nuevos, ${updated} actualizados`);
  // Código de acceso por email a los nuevos (en segundo plano: pueden ser cientos)
  let emailed = 0;
  let emailError: string | undefined;
  if (form.get("sendEmail") === "1" && createdIds.length) {
    if (!mailEnabled()) emailError = "El envío de emails no está configurado (SMTP).";
    else {
      const targets = await db.worker.findMany({ where: { id: { in: createdIds }, email: { not: null } } });
      emailed = targets.length;
      after(async () => {
        let sent = 0;
        for (const w of targets) if (!(await sendAccessEmail(w))) sent++;
        await auditAdmin(by, "Trabajador", "Código por email", `Códigos de acceso enviados por email tras la importación: ${sent} de ${targets.length}`);
      });
    }
  }
  revalidatePath("/admin", "layout");
  return { step: "done", created, updated, skipped: result.counts.existe, errors: result.counts.error, emailed, emailError };
}
