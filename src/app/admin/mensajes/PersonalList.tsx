import Link from "next/link";
import { WorkerPicker } from "@/components/WorkerPicker";
import { db } from "@/lib/db";
import { staffThreads } from "@/lib/workerChat";
import { openWorkerChat } from "./actions";

const timeFmt = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

/** Conversaciones de RRHH con el personal (las ve y contesta cualquiera de RRHH) y buscador para escribir a alguien. */
export async function PersonalList({ activeId }: { activeId?: string }) {
  const [threads, workers] = await Promise.all([
    staffThreads(),
    db.worker.findMany({ where: { active: true }, select: { id: true, name: true, dni: true, phone: true }, orderBy: { name: "asc" } }),
  ]);
  const today = dayKey(new Date());
  return (
    <div className="space-y-3">
      <form action={openWorkerChat} className="card space-y-2 p-3">
        <div className="text-sm font-medium">Escribir a un trabajador</div>
        <WorkerPicker workers={workers} required />
        <button className="btn btn-primary btn-sm w-full">Abrir chat</button>
      </form>
      {threads.length === 0 ? (
        <p className="px-1 text-xs text-stone-500">Aún no hay conversaciones con el personal. Busca a alguien arriba para escribirle: le llega el aviso al móvil.</p>
      ) : (
        <ul className="card divide-y p-0">
          {threads.map((t) => {
            const at = t.last ? new Date(t.last.at) : null;
            return (
              <li key={t.workerId}>
                <Link href={`/admin/mensajes/personal/${t.workerId}`} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 ${t.workerId === activeId ? "bg-stone-100" : ""}`}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-800">
                    {t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${t.unread ? "font-semibold" : "font-medium"}`}>{t.name}</span>
                      {at && <span className={`shrink-0 text-[11px] ${t.unread ? "text-emerald-700" : "text-stone-400"}`}>{dayKey(at) === today ? timeFmt.format(at) : dateFmt.format(at)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-stone-500">{t.last ? `${t.last.author}: ${t.last.text}` : "Sin mensajes"}</span>
                      {t.unread > 0 && <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{t.unread}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
