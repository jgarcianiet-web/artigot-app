"use client";

import { startTransition, useActionState } from "react";
import { requestDocuments } from "@/app/actions";
import { RequestFields } from "@/components/StaffForms";
import { WorkerChooser, type ChooserWorker } from "@/components/WorkerChooser";

/** Pedir el mismo documento a una o varias personas. */
export function RequestManyForm({ workers, initial }: { workers: ChooserWorker[]; initial: string[] }) {
  const [msg, run, pending] = useActionState(requestDocuments, null);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        // Sin `action` para que, si hay un error, no se vacíe el formulario
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
    >
      <div className="card space-y-3">
        <h2>Qué documento</h2>
        <RequestFields />
      </div>
      <WorkerChooser workers={workers} initial={initial} title="A quién se lo pides" />
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Pidiendo…" : "Pedir documento"}</button>
      <p className="text-xs text-stone-500">
        Le llega un aviso al móvil (o un email si no tiene avisos) y lo sube desde la app, en su perfil. Cuando lo sube, aparece en Documentos → Por revisar: si
        lo rechazas, se le pide de nuevo con el motivo. A los 2 días se le recuerda a quien no lo haya subido.
      </p>
    </form>
  );
}
