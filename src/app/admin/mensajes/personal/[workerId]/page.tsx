import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InboxRefresh, StaffChat } from "@/components/StaffChat";
import { currentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { dmMessages, dmReads, RRHH, WORKER } from "@/lib/workerChat";
import { PersonalList } from "../../PersonalList";
import { MessageTabs } from "../../Tabs";

/** Conversación de RRHH con un trabajador. */
export default async function WorkerChatPage({ params }: { params: Promise<{ workerId: string }> }) {
  const me = await currentAdmin();
  if (!me) redirect("/login");
  const { workerId } = await params;
  const worker = await db.worker.findUnique({ where: { id: workerId }, select: { id: true, name: true, phone: true, _count: { select: { devices: true } } } });
  if (!worker) notFound();
  const [messages, reads] = await Promise.all([dmMessages(workerId), dmReads(workerId)]);
  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="hidden space-y-3 lg:block">
          <MessageTabs meId={me.id} active="personal" />
          <PersonalList activeId={workerId} />
        </div>
        <div className="flex h-[calc(100dvh-7rem)] min-h-96 flex-col gap-2">
          <div className="flex items-center gap-2">
            <Link href="/admin/mensajes?ver=personal" className="btn btn-sm lg:hidden" aria-label="Volver a las conversaciones">‹</Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg">
                <Link href={`/admin/personal/${worker.id}`} className="hover:underline">{worker.name}</Link>
              </h1>
              <p className="truncate text-xs text-stone-500">
                {worker._count.devices > 0 ? "Le llega el aviso al móvil" : "No tiene los avisos activados: se le avisa por email (si tiene)"} · lo ve todo RRHH
              </p>
            </div>
          </div>
          <StaffChat
            key={workerId}
            roomId={workerId}
            meId={RRHH}
            base={`/api/dm/${workerId}`}
            initial={messages}
            members={[
              { id: RRHH, name: "RRHH", lastReadAt: reads[RRHH] },
              { id: WORKER, name: worker.name, lastReadAt: reads[WORKER] },
            ]}
            group={false}
            emptyText={`Escribe a ${worker.name.split(" ")[0]}: le saltará el aviso en el móvil y podrá contestar aquí.`}
          />
        </div>
      </div>
      <InboxRefresh />
    </div>
  );
}
