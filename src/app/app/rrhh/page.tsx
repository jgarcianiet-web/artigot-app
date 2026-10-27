import Link from "next/link";
import { StaffChat } from "@/components/StaffChat";
import { requireWorker } from "@/lib/auth";
import { dmMessages, dmReads, RRHH, WORKER } from "@/lib/workerChat";

/** Chat del trabajador con RRHH. */
export default async function ChatWithStaff() {
  const me = await requireWorker();
  const [messages, reads] = await Promise.all([dmMessages(me.id), dmReads(me.id)]);
  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-80 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Link href="/app/chats" className="btn btn-sm" aria-label="Volver a los chats">‹</Link>
        <div>
          <h1 className="text-lg">RRHH</h1>
          <p className="text-xs text-stone-500">Tu chat privado con Recursos Humanos</p>
        </div>
      </div>
      <StaffChat
        roomId={me.id}
        meId={WORKER}
        base={`/api/dm/${me.id}`}
        initial={messages}
        members={[
          { id: WORKER, name: me.name, lastReadAt: reads[WORKER] },
          { id: RRHH, name: "RRHH", lastReadAt: reads[RRHH] },
        ]}
        group
        emptyText="Aquí puedes hablar con RRHH. Solo lo veis tú y RRHH."
      />
    </div>
  );
}
