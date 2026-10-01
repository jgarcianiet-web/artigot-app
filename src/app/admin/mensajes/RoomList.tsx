import Link from "next/link";
import { db } from "@/lib/db";
import { myRooms } from "@/lib/staffChat";
import { NewChat } from "./NewChat";

const timeFmt = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

/** Lista de conversaciones (como la de WhatsApp). */
export async function RoomList({ meId, activeId }: { meId: string; activeId?: string }) {
  const [rooms, people] = await Promise.all([
    myRooms(meId),
    db.adminUser.findMany({ where: { active: true, id: { not: meId } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const today = dayKey(new Date());
  return (
    <div className="space-y-3">
      <NewChat people={people} />
      <ul className="card divide-y p-0">
        {rooms.map((r) => {
          const at = r.last ? new Date(r.last.at) : null;
          return (
            <li key={r.id}>
              <Link href={`/admin/mensajes/${r.id}`} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 ${r.id === activeId ? "bg-stone-100" : ""}`}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700">
                  {r.kind === "DIRECTO" ? r.title.split(" ").map((w) => w[0]).slice(0, 2).join("") : r.kind === "GENERAL" ? "👥" : "#"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${r.unread ? "font-semibold" : "font-medium"}`}>{r.title}</span>
                    {at && <span className={`shrink-0 text-[11px] ${r.unread ? "text-emerald-700" : "text-stone-400"}`}>{dayKey(at) === today ? timeFmt.format(at) : dateFmt.format(at)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-stone-500">{r.last ? `${r.kind !== "DIRECTO" || r.last.author === "Tú" ? `${r.last.author}: ` : ""}${r.last.text}` : r.subtitle || "Sin mensajes"}</span>
                    {r.unread > 0 && <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{r.unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
