import { approveSwapAction, rejectSwapAction } from "@/app/actions";
import { formatDate, ROLE_LABEL, type Role } from "@/lib/domain";

type Swap = {
  id: string;
  status: string;
  message: string | null;
  event: { id: string; name: string; date: string };
  fromWorker: { name: string };
  toWorker: { name: string };
  assignment: { role: string };
};

/** Cambios de turno: los aceptados por el compañero se aprueban con un clic. */
export function SwapApprovals({ swaps, showEvent = true }: { swaps: Swap[]; showEvent?: boolean }) {
  if (!swaps.length) return null;
  return (
    <ul className="card divide-y divide-stone-100 p-0 text-sm">
      {swaps.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div>
              <strong>{s.toWorker.name}</strong> cubre a <strong>{s.fromWorker.name}</strong> ({ROLE_LABEL[s.assignment.role as Role]?.toLowerCase()})
              {showEvent && (
                <>
                  {" "}en <a href={`/admin/eventos/${s.event.id}`} className="link">{s.event.name}</a> · {formatDate(s.event.date)}
                </>
              )}
            </div>
            <div className="text-xs text-stone-500">
              {s.status === "ACEPTADO" ? "El compañero ha aceptado: falta tu aprobación" : "Esperando respuesta del compañero"}
              {s.message && ` · «${s.message}»`}
            </div>
          </div>
          {s.status === "ACEPTADO" && (
            <form action={approveSwapAction.bind(null, s.id)}><button className="btn btn-sm btn-success">Aprobar cambio</button></form>
          )}
          <form action={rejectSwapAction.bind(null, s.id)}><button className="btn btn-sm">Rechazar</button></form>
        </li>
      ))}
    </ul>
  );
}
