import { FileLink } from "./FileLink";
import { INCIDENT_LABEL } from "@/lib/incidentTypes";

type Incident = {
  id: string;
  type: string;
  description: string;
  resolved: boolean;
  resolution: string | null;
  createdAt: Date;
  reporterAdmin: string | null;
  reporter: { name: string } | null;
  worker: { name: string } | null;
  photos: { id: string }[];
  event?: { name: string; date: string; id: string };
};

const time = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Lista de incidencias. `actions` (solo RRHH) permite cerrarlas o reabrirlas. */
export function IncidentList({
  incidents,
  resolveAction,
  reopenAction,
}: {
  incidents: Incident[];
  resolveAction?: (id: string, form: FormData) => Promise<void>;
  reopenAction?: (id: string) => Promise<void>;
}) {
  if (!incidents.length) return <p className="text-sm text-stone-500">Sin incidencias.</p>;
  return (
    <ul className="space-y-2">
      {incidents.map((i) => (
        <li key={i.id} className={`card space-y-2 ${i.resolved ? "opacity-70" : "border-amber-300"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{INCIDENT_LABEL[i.type] ?? i.type}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${i.resolved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              {i.resolved ? "Resuelta" : "Abierta"}
            </span>
          </div>
          {i.event && (
            <a href={`/admin/eventos/${i.event.id}/directo`} className="link text-sm">{i.event.name} · {i.event.date}</a>
          )}
          <p className="text-sm whitespace-pre-line">{i.description}</p>
          <p className="text-xs text-stone-500">
            {time.format(i.createdAt)} · {i.reporter?.name ?? `${i.reporterAdmin} (RRHH)`}
            {i.worker && ` · implicado: ${i.worker.name}`}
          </p>
          {i.photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {i.photos.map((p) => (
                <FileLink key={p.id} href={`/api/files/${p.id}`} title="Foto de la incidencia">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${p.id}`} alt="Foto de la incidencia" className="h-24 w-24 rounded-md object-cover" loading="lazy" />
                </FileLink>
              ))}
            </div>
          )}
          {i.resolution && <p className="text-sm text-emerald-800">✓ {i.resolution}</p>}
          {resolveAction && !i.resolved && (
            <form action={resolveAction.bind(null, i.id)} className="flex gap-2">
              <input name="resolution" className="input" placeholder="Cómo se ha resuelto (opcional)" />
              <button className="btn btn-sm shrink-0">Marcar resuelta</button>
            </form>
          )}
          {reopenAction && i.resolved && (
            <form action={reopenAction.bind(null, i.id)}>
              <button className="text-xs text-stone-500 hover:underline">Reabrir</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
