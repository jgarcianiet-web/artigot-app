"use client";

import { startTransition, useActionState } from "react";
import { WorkerChooser, type ChooserWorker } from "@/components/WorkerChooser";
import { sendSignRequest } from "../actions";
import { ExternalRows } from "./ExternalRows";

/** Enviar un PDF a firmar: título, mensaje opcional, el PDF y a quién. */
export function SignRequestForm({ workers, initial }: { workers: ChooserWorker[]; initial: string[] }) {
  const [msg, run, pending] = useActionState(sendSignRequest, null);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        // Sin `action` para que, si hay un error, no se vacíe el formulario (título, mensaje y PDF)
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
    >
      <div className="card space-y-3">
        <label className="block text-sm font-medium">
          Título
          <input name="title" className="input mt-1" required maxLength={120} placeholder="P. ej. Anexo al contrato: cambio de jornada" />
        </label>
        <label className="block text-sm font-medium">
          Documentos (PDF)
          <span className="block text-xs font-normal text-stone-500">
            Puedes elegir varios a la vez (hasta 10, de 10 MB cada uno): se firman todos de una vez y cada uno sale firmado por separado.
          </span>
          <input name="file" type="file" accept="application/pdf,.pdf" multiple required className="mt-1 block w-full text-sm" />
        </label>
        <label className="block text-sm font-medium">
          Mensaje para el personal <span className="font-normal text-stone-500">(opcional)</span>
          <textarea name="message" rows={3} maxLength={2000} className="input mt-1" placeholder="P. ej. Desde el 1 de diciembre cambia tu jornada. Léelo y fírmalo antes del viernes." />
        </label>
      </div>
      <WorkerChooser workers={workers} initial={initial} title="Quién tiene que firmarlo" />
      <ExternalRows />
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Enviando…" : "Enviar para firmar"}</button>
      <p className="text-xs text-stone-500">
        Al personal le llega un aviso al móvil (o un email si no tiene avisos); a los de fuera, su enlace por email o por WhatsApp. Firman con el dedo en la app y su copia firmada lleva la firma en cada página y una
        hoja final con quién, cuándo y la huella del documento. A los 2 días se le recuerda a quien no haya firmado.
      </p>
    </form>
  );
}
