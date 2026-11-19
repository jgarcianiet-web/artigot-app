import Link from "next/link";
import { ConfirmButton } from "@/components/client";
import { formatDate } from "@/lib/domain";
import { resolveEmploymentWarning } from "./actions";

type W = { id: string; startDate: string; endDate: string | null; warning: string | null; warningKind: string | null; worker: { id: string; name: string } };

/**
 * Altas ya comunicadas que hay que anular o corregir en RED. Se quedan aquí (y en Tareas de hoy) hasta que RRHH
 * marca que lo ha hecho.
 */
export function RedWarnings({ warnings, title = "⚠️ Revisar en RED" }: { warnings: W[]; title?: string }) {
  if (!warnings.length) return null;
  return (
    <section id="red" className="card scroll-mt-4 space-y-2 border-amber-300 bg-amber-50">
      <h2>{title}</h2>
      <p className="text-xs text-amber-900">Ya estaban comunicadas a la Seguridad Social. Hazlo en RED (o en A3) y márcalo aquí: hasta entonces sigue en Tareas de hoy.</p>
      <ul className="divide-y divide-amber-200 text-sm">
        {warnings.map((e) => {
          const anular = e.warningKind !== "CORREGIR";
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/personal/${e.worker.id}`} className="link font-medium">{e.worker.name}</Link>
                <span className="text-stone-600"> · alta del {formatDate(e.startDate)}{e.endDate && e.endDate !== e.startDate ? ` al ${formatDate(e.endDate)}` : ""}</span>
                <div className="text-amber-900">{e.warning}</div>
              </div>
              <form action={resolveEmploymentWarning.bind(null, e.id)}>
                <ConfirmButton
                  className="btn btn-sm btn-primary"
                  message={anular ? `¿Ya has anulado en RED el alta de ${e.worker.name}? Se quitará de Altas y bajas.` : `¿Ya has corregido en RED el alta de ${e.worker.name}?`}
                >
                  {anular ? "✓ Anulada en RED" : "✓ Corregida en RED"}
                </ConfirmButton>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
