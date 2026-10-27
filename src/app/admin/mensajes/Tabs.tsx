import Link from "next/link";
import { unreadTotal } from "@/lib/staffChat";
import { staffDmUnread } from "@/lib/workerChat";
import { staffGroupUnread } from "@/lib/workerGroups";

/** Pestañas de Mensajes: el chat interno de RRHH y las conversaciones con el personal. */
export async function MessageTabs({ meId, active }: { meId: string; active: "equipo" | "personal" }) {
  const [team, dms, groups] = await Promise.all([unreadTotal(meId), staffDmUnread(), staffGroupUnread()]);
  const personal = dms + groups;
  const tab = (key: "equipo" | "personal", href: string, label: string, n: number) => (
    <Link href={href} className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm ${active === key ? "bg-white font-semibold shadow-sm" : "text-stone-600 hover:text-stone-900"}`}>
      {label}
      {n > 0 && <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{n}</span>}
    </Link>
  );
  return (
    <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
      {tab("equipo", "/admin/mensajes", "Equipo RRHH", team)}
      {tab("personal", "/admin/mensajes?ver=personal", "Personal", personal)}
    </div>
  );
}
