import { redirect } from "next/navigation";
import { InboxRefresh } from "@/components/StaffChat";
import { currentAdmin } from "@/lib/auth";
import { PersonalList } from "./PersonalList";
import { RoomList } from "./RoomList";
import { MessageTabs } from "./Tabs";

export default async function Messages({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const me = await currentAdmin();
  if (!me) redirect("/login");
  const personal = (await searchParams).ver === "personal";
  return (
    <div className="space-y-3">
      <div>
        <h1>Mensajes</h1>
        <p className="text-sm text-stone-500">
          {personal
            ? "Chat con cada trabajador: le salta el aviso en el móvil y puede contestar. Lo veis y contestáis todos los de RRHH."
            : "Chat interno de RRHH: solo lo veis los usuarios de RRHH, nunca el personal."}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[16rem_1fr] lg:grid-cols-[20rem_1fr]">
        <div className="space-y-3">
          <MessageTabs meId={me.id} active={personal ? "personal" : "equipo"} />
          {personal ? <PersonalList /> : <RoomList meId={me.id} />}
        </div>
        <div className="card hidden items-center justify-center text-sm text-stone-500 md:flex md:min-h-96">Elige una conversación</div>
      </div>
      <InboxRefresh />
    </div>
  );
}
