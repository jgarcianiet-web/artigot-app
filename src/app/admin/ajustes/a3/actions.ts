"use server";

import { revalidatePath } from "next/cache";
import { A3_ALTA_DEFAULTS, getA3Alta, saveA3Alta, type A3AltaConfig } from "@/lib/a3alta";
import { importA3Database, type A3ImportResult } from "@/lib/a3import";
import { diff, auditAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { ROLES } from "@/lib/domain";

export async function importA3DatabaseAction(_prev: A3ImportResult | null, form: FormData): Promise<A3ImportResult> {
  const by = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Selecciona un archivo." };
  const res = await importA3Database(file, by, { replaceRates: form.get("replaceRates") === "1" });
  revalidatePath("/admin/ajustes/a3");
  revalidatePath("/admin/personal", "layout");
  return res;
}

export async function saveA3AltaAction(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const get = (k: keyof A3AltaConfig) => String(form.get(k) ?? "").trim() || String(A3_ALTA_DEFAULTS[k]);
  const before = await getA3Alta();
  const lastCode = Number(String(form.get("lastCode") ?? "").trim() || before.lastCode);
  if (!Number.isInteger(lastCode) || lastCode < 0) return "El último código usado tiene que ser un número.";
  const value: A3AltaConfig = {
    center: get("center"),
    agreement: get("agreement"),
    category: get("category"),
    position: get("position"),
    regime: get("regime"),
    tariffGroup: get("tariffGroup"),
    paymentType: get("paymentType"),
    contractType: get("contractType"),
    contributionType: get("contributionType"),
    grossType: get("grossType"),
    occupation: Object.fromEntries(ROLES.map((r) => [r, String(form.get(`occupation_${r}`) ?? "").trim() || A3_ALTA_DEFAULTS.occupation[r]])) as A3AltaConfig["occupation"],
    education: get("education"),
    nationality: get("nationality"),
    lastCode,
    bajaReason: get("bajaReason"),
    bajaInactivity: String(form.get("bajaInactivity") ?? "").trim(),
  };
  await saveA3Alta(value);
  const d = diff({ ...before, occupation: JSON.stringify(before.occupation) }, { ...value, occupation: JSON.stringify(value.occupation) }, {
    center: "Centro", agreement: "Convenio", category: "Categoría", position: "Puesto", regime: "Régimen", tariffGroup: "Grupo de tarifa",
    paymentType: "Tipo de cobro", contractType: "Contrato", contributionType: "Cotización", grossType: "Bruto anual", occupation: "Ocupación",
    education: "Nivel formativo", nationality: "Nacionalidad", lastCode: "Último código", bajaReason: "Motivo de baja", bajaInactivity: "Inactividad",
  });
  if (d.changed) await auditAdmin(by, "Ajustes", "Alta A3", d.text, { data: d.data });
  revalidatePath("/admin/ajustes/a3");
  return "Guardado.";
}
