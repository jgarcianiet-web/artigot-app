import { currentAdmin, currentWorker } from "@/lib/auth";
import { isGroupMember, type GroupSide } from "@/lib/workerGroups";

/** Quién puede usar un grupo: cualquiera de RRHH o un trabajador que sea miembro. */
export async function groupAccess(groupId: string): Promise<GroupSide | null> {
  const admin = await currentAdmin();
  if (admin) return { side: "rrhh", id: admin.id, name: admin.name };
  const w = await currentWorker();
  return w && (await isGroupMember(groupId, w.id)) ? { side: "worker", id: w.id, name: w.name } : null;
}
