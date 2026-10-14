"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isRole } from "@/lib/domain";
import { completeFromFile, type A3ImportResult } from "@/lib/a3import";

/** Importar desde A3: «Revisar» solo dice qué se va a hacer; «Importar» lo guarda. */
export async function importFromA3(_prev: A3ImportResult | null, form: FormData): Promise<A3ImportResult> {
  const by = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Elige el Excel exportado de A3." };
  const role = String(form.get("defaultRole") ?? "");
  const res = await completeFromFile(file, by, {
    create: true,
    dryRun: form.get("intent") !== "import",
    replaceRates: form.get("replaceRates") === "1",
    defaultRole: isRole(role) ? role : undefined,
  });
  if (!res.preview) revalidatePath("/admin", "layout");
  return res;
}
