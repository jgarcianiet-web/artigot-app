import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { GroupForm } from "../../GroupForm";
import { pickableWorkers } from "@/lib/pickableWorkers";

export default async function EditGroup({ params }: { params: Promise<{ groupId: string }> }) {
  if (!(await currentAdmin())) redirect("/login");
  const { groupId } = await params;
  const g = await db.workerGroup.findUnique({ where: { id: groupId }, include: { members: { select: { workerId: true } } } });
  if (!g) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/admin/mensajes/grupos/${g.id}`} className="btn btn-sm shrink-0">‹ Volver</Link>
        <h1 className="truncate">Editar «{g.name}»</h1>
      </div>
      <GroupForm workers={await pickableWorkers()} group={{ id: g.id, name: g.name, onlyStaff: g.onlyStaff, memberIds: g.members.map((m) => m.workerId) }} />
    </div>
  );
}
