import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffChat } from "@/components/StaffChat";
import { requireWorker } from "@/lib/auth";
import { GROUP_RRHH, groupInfo, groupMessages, isGroupMember } from "@/lib/workerGroups";

/** Grupo de RRHH visto por un trabajador que está en él. */
export default async function WorkerGroupChat({ params }: { params: Promise<{ groupId: string }> }) {
  const me = await requireWorker();
  const { groupId } = await params;
  if (!(await isGroupMember(groupId, me.id))) notFound();
  const [group, messages] = await Promise.all([groupInfo(groupId), groupMessages(groupId)]);
  if (!group) notFound();
  const people = group.members.filter((m) => m.id !== GROUP_RRHH).length;
  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-80 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Link href="/app/chats" className="btn btn-sm" aria-label="Volver a los chats">‹</Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg">{group.name}</h1>
          <p className="truncate text-xs text-stone-500">Grupo de RRHH · {people} personas</p>
        </div>
      </div>
      <StaffChat
        key={groupId}
        roomId={groupId}
        meId={me.id}
        base={`/api/grupos/${groupId}`}
        initial={messages}
        members={group.members}
        group
        emptyText="Aquí RRHH enviará los avisos del grupo."
        readOnlyText={group.onlyStaff ? "Solo RRHH puede escribir en este grupo. Si necesitas algo, escríbeles en su chat privado." : undefined}
      />
    </div>
  );
}
