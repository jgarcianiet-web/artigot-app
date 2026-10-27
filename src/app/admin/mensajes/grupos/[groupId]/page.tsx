import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmButton } from "@/components/client";
import { InboxRefresh, StaffChat } from "@/components/StaffChat";
import { currentAdmin } from "@/lib/auth";
import { GROUP_RRHH, groupInfo, groupMessages } from "@/lib/workerGroups";
import { deleteGroupAction } from "../../actions";
import { PersonalList } from "../../PersonalList";
import { MessageTabs } from "../../Tabs";

/** Grupo de RRHH con el personal. */
export default async function GroupChatPage({ params }: { params: Promise<{ groupId: string }> }) {
  const me = await currentAdmin();
  if (!me) redirect("/login");
  const { groupId } = await params;
  const [group, messages] = await Promise.all([groupInfo(groupId), groupMessages(groupId)]);
  if (!group) notFound();
  const people = group.members.filter((m) => m.id !== GROUP_RRHH);
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-[16rem_1fr] lg:grid-cols-[20rem_1fr]">
        <div className="hidden space-y-3 md:block">
          <MessageTabs meId={me.id} active="personal" />
          <PersonalList activeId={groupId} />
        </div>
        <div className="flex h-[calc(100dvh-7rem)] min-h-96 min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/mensajes?ver=personal" className="btn btn-sm shrink-0 md:hidden">‹ Conversaciones</Link>
            <div className="min-w-0 flex-1 basis-48">
              <h1 className="truncate text-lg">👥 {group.name}</h1>
              <details className="text-xs text-stone-500">
                <summary className="cursor-pointer truncate">
                  {people.length} personas{group.onlyStaff ? " · solo escribe RRHH" : ""} · lo ve todo RRHH
                </summary>
                <p className="mt-1 max-h-32 overflow-y-auto">{people.map((p) => p.name).join(", ")}</p>
              </details>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href={`/admin/mensajes/grupos/${groupId}/editar`} className="btn btn-sm">Editar</Link>
              {messages.length > 0 && <a href={`/api/grupos/${groupId}/export`} className="btn btn-sm" download>Exportar PDF</a>}
              <form action={deleteGroupAction}>
                <input type="hidden" name="groupId" value={groupId} />
                <ConfirmButton className="btn btn-sm btn-danger" message={`¿Eliminar el grupo «${group.name}» con todos sus mensajes y fotos? Desaparece para todos y no se puede recuperar. Si lo necesitas, expórtalo antes.`}>
                  Eliminar
                </ConfirmButton>
              </form>
            </div>
          </div>
          <StaffChat
            key={groupId}
            roomId={groupId}
            meId={GROUP_RRHH}
            base={`/api/grupos/${groupId}`}
            initial={messages}
            members={group.members}
            group
            emptyText={`Escribe al grupo: a las ${people.length} personas les saltará el aviso en el móvil.`}
          />
        </div>
      </div>
      <InboxRefresh />
    </div>
  );
}
