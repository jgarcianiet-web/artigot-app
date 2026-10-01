import { redirect } from "next/navigation";
import { InboxRefresh } from "@/components/StaffChat";
import { currentAdmin } from "@/lib/auth";
import { RoomList } from "./RoomList";

export default async function Messages() {
  const me = await currentAdmin();
  if (!me) redirect("/login");
  return (
    <div className="space-y-3">
      <div>
        <h1>Mensajes</h1>
        <p className="text-sm text-stone-500">Chat interno de RRHH: solo lo veis los usuarios de RRHH, nunca el personal.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <RoomList meId={me.id} />
        <div className="card hidden items-center justify-center text-sm text-stone-500 lg:flex lg:min-h-96">Elige una conversación</div>
      </div>
      <InboxRefresh />
    </div>
  );
}
