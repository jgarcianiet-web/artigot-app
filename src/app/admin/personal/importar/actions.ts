"use server";

import { revalidatePath } from "next/cache";
import { newAccessCode, phoneKey, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isRole } from "@/lib/domain";
import { analyzeFile, type ImportPreview } from "@/lib/importStaff";

export type ImportState =
  | { step: "idle" }
  | { step: "error"; error: string }
  | { step: "preview"; preview: ImportPreview }
  | { step: "done"; created: number; updated: number; skipped: number; errors: number };

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
  await requireAdmin();
  const opts = options(form);
  const result = await analyzeFile(form.get("file") as File, opts);
  if ("error" in result) return { step: "error", error: result.error };

  let created = 0;
  let updated = 0;
  await db.$transaction(
    async (tx) => {
      for (const r of result.rows) {
        if (r.status === "nuevo") {
          await tx.worker.create({
            data: {
              name: r.name,
              phone: r.phone,
              phoneKey: phoneKey(r.phone),
              role: r.role!,
              email: r.email,
              zone: r.zone,
              rating: r.rating ?? 3,
              notes: r.notes,
              accessCode: newAccessCode(),
            },
          });
          created++;
        } else if (r.status === "actualizar") {
          // Solo se sobrescriben los datos que vienen rellenos en el Excel
          await tx.worker.update({
            where: { phoneKey: phoneKey(r.phone) },
            data: {
              name: r.name,
              phone: r.phone,
              ...(r.roleRaw && r.role && { role: r.role }),
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
  revalidatePath("/admin", "layout");
  return { step: "done", created, updated, skipped: result.counts.existe, errors: result.counts.error };
}
