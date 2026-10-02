import Link from "next/link";
import { mergeWorkersAction } from "@/app/actions";
import { Empty } from "@/components/ui";
import { formatDate } from "@/lib/domain";
import { duplicateGroups } from "@/lib/mergeWorkers";
import { MergeForm } from "./MergeForm";

/** Fichas repetidas: mismo DNI con el nombre escrito distinto. Se elige cuál se queda y se unen. */
export default async function Duplicates({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const groups = await duplicateGroups();
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/admin/personal" className="text-sm text-stone-500 hover:underline">‹ Personal</Link>
      <h1>Fichas repetidas</h1>
      {ok && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">✓ {ok.slice(0, 300)}</p>}
      <p className="text-sm text-stone-500">
        Personas con el mismo DNI. Elige la ficha que se queda (normalmente la que usa para entrar en la app) y pulsa «Unir»: se pasan a ella los servicios,
        fichajes, documentos, altas, pagos y mensajes de la otra, y los datos que le falten. La repetida se borra. Queda en el registro de cambios.
      </p>
      {groups.length === 0 ? (
        <Empty>No hay fichas repetidas.</Empty>
      ) : (
        groups.map((g) => (
          <MergeForm key={g.dni} action={mergeWorkersAction} dni={g.dni}
            workers={g.workers.map((w) => ({
              id: w.id, name: w.name, active: w.active,
              detail: [w.phone ?? w.email ?? "sin teléfono", w.a3Code && `A3 ${w.a3Code}`, `${w._count.assignments} servicios`, `${w._count.documents} documentos`, `alta en la app ${formatDate(w.createdAt.toISOString().slice(0, 10))}`].filter(Boolean).join(" · "),
            }))}
          />
        ))
      )}
    </div>
  );
}
