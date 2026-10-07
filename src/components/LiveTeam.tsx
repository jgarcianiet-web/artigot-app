import type { liveTeam, LiveState } from "@/lib/live";
import { ROLE_LABEL, type Role } from "@/lib/domain";

type Live = Awaited<ReturnType<typeof liveTeam>>;

const STATE: Record<LiveState, { label: string; cls: string }> = {
  esperando: { label: "Aún no ha llegado", cls: "bg-stone-100 text-stone-600" },
  retraso: { label: "Sin fichar", cls: "bg-red-100 text-red-700" },
  trabajando: { label: "Trabajando", cls: "bg-emerald-100 text-emerald-800" },
  terminado: { label: "Ha salido", cls: "bg-sky-100 text-sky-800" },
};

/** Panel en directo del equipo. `markAction` (solo para el responsable) permite marcar la llegada a mano. */
export function LiveTeam({ live, markAction }: { live: Live; markAction?: (assignmentId: string) => Promise<void> }) {
  const { rows, summary } = live;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { n: summary.trabajando, l: "Trabajando", c: "text-emerald-700" },
          { n: summary.retraso, l: "Sin fichar", c: summary.retraso ? "text-red-600" : "text-stone-400" },
          { n: summary.esperando, l: "Por llegar", c: "text-stone-600" },
          { n: summary.terminado, l: "Han salido", c: "text-sky-700" },
        ].map((s) => (
          <div key={s.l} className="card p-2">
            <div className={`text-2xl font-semibold ${s.c}`}>{s.n}</div>
            <div className="text-xs text-stone-500">{s.l}</div>
          </div>
        ))}
      </div>
      <ul className="card divide-y divide-stone-100 p-0">
        {rows.map((r) => (
          <li key={r.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${r.state === "retraso" ? "bg-red-50" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-stone-500">
                {r.group && `${r.group} · `}{ROLE_LABEL[r.role as Role]} · citación {r.call}
                {r.checkIn && ` · entrada ${r.checkIn}`}
                {r.checkIn && (r.manual ? " (manual)" : r.distance != null ? ` · 📍 ${r.distance} m` : "")}
                {r.checkOut && ` · salida ${r.checkOut}`}
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>
            {(r.state === "retraso" || r.state === "esperando") && r.phone && (
              <a href={`tel:${r.phone}`} className="btn btn-sm">📞 Llamar</a>
            )}
            {markAction && !r.checkIn && !r.lead && (
              <form action={markAction.bind(null, r.id)}>
                <button className="btn btn-sm" title="Si no puede fichar (sin batería, sin GPS…), márcale la llegada">Marcar llegada</button>
              </form>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-4 text-sm text-stone-500">No hay personal confirmado.</li>}
      </ul>
    </div>
  );
}
