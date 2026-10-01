import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InboxRefresh, StaffChat } from "@/components/StaffChat";
import { currentAdmin } from "@/lib/auth";
import { roomInfo, roomMessages } from "@/lib/staffChat";
import { RoomList } from "../RoomList";

export default async function Room({ params }: { params: Promise<{ roomId: string }> }) {
  const me = await currentAdmin();
  if (!me) redirect("/login");
  const { roomId } = await params;
  const room = await roomInfo(roomId, me.id);
  if (!room) notFound();
  const messages = await roomMessages(roomId);
  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="hidden lg:block">
          <RoomList meId={me.id} activeId={roomId} />
        </div>
        <div className="flex h-[calc(100dvh-7rem)] min-h-96 flex-col gap-2">
          <div className="flex items-center gap-2">
            <Link href="/admin/mensajes" className="btn btn-sm lg:hidden" aria-label="Volver a las conversaciones">‹</Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg">{room.title}</h1>
              {room.kind !== "DIRECTO" && <p className="truncate text-xs text-stone-500">{room.members.map((m) => (m.id === me.id ? "Tú" : m.name)).join(", ")}</p>}
            </div>
          </div>
          <StaffChat key={roomId} roomId={roomId} meId={me.id} initial={messages} members={room.members} group={room.kind !== "DIRECTO"} />
        </div>
      </div>
      <InboxRefresh />
    </div>
  );
}
