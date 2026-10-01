"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { backupNow } from "@/lib/backup";
import { migrateFilesToStorage } from "@/lib/files";

export async function backupNowAction(_prev: string | null) {
  const by = await requireAdmin();
  try {
    const r = await backupNow();
    await auditAdmin(by, "Copias", "Copia manual", `Copia de seguridad ${r.key} (${Math.round(r.size / 1024)} KB)`);
    revalidatePath("/admin/ajustes/copias");
    return `Copia hecha (${Math.round(r.size / 1024)} KB).`;
  } catch (e) {
    return `No se ha podido hacer la copia: ${(e as Error).message}`;
  }
}

export async function migrateFilesAction(_prev: string | null) {
  const by = await requireAdmin();
  try {
    const r = await migrateFilesToStorage(50, 20_000);
    if (r.moved) await auditAdmin(by, "Copias", "Archivos al almacén", `${r.moved} archivos movidos al almacén`);
    revalidatePath("/admin/ajustes/copias");
    return r.remaining ? `${r.moved} archivos movidos; quedan ${r.remaining}. Pulsa otra vez para seguir.` : `${r.moved} archivos movidos. Ya están todos en el almacén.`;
  } catch (e) {
    return `No se han podido mover: ${(e as Error).message}`;
  }
}
