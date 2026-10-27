import { currentAdmin, currentWorker } from "@/lib/auth";
import { RRHH, WORKER, type DmSide } from "@/lib/workerChat";

/** Quién puede usar la conversación de un trabajador: cualquiera de RRHH o el propio trabajador. */
export async function dmAccess(workerId: string): Promise<{ side: DmSide; id: string; name: string } | null> {
  const admin = await currentAdmin();
  if (admin) return { side: RRHH, id: admin.id, name: admin.name };
  const w = await currentWorker();
  return w && w.id === workerId ? { side: WORKER, id: w.id, name: w.name } : null;
}
