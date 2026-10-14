"use client";

import { useActionState, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { withdraw } from "../../actions";

/** «Ya no puedo ir» con motivo obligatorio. Con menos de 24 h queda pendiente de que lo apruebe RRHH. */
export function WithdrawForm({ assignmentId, free }: { assignmentId: string; free: boolean }) {
  const [open, setOpen] = useState(false);
  const [r, action] = useActionState(withdraw.bind(null, assignmentId), null);
  if (r?.ok) return <p role="status" className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{r.message}</p>;
  if (!open) {
    return (
      <button type="button" className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>
        Ya no puedo ir
      </button>
    );
  }
  return (
    <ActionForm action={action} className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <label htmlFor="withdraw-reason" className="block text-sm font-medium text-red-900">¿Por qué no puedes ir? (obligatorio)</label>
      <textarea id="withdraw-reason" name="reason" className="input min-h-20 text-base" maxLength={300} minLength={3} required autoFocus placeholder="Escribe el motivo" />
      <p className="text-xs text-red-900">
        {free
          ? "Faltan más de 24 h: al enviarlo dejas de estar en el evento y RRHH buscará a otra persona."
          : "Faltan menos de 24 h: RRHH tiene que aprobarlo. Hasta que lo apruebe sigues confirmado y tienes que ir."}
      </p>
      {r && !r.ok && <p className="text-sm text-red-700">{r.message}</p>}
      <div className="flex gap-2">
        <SubmitButton className="btn btn-danger flex-1">{free ? "Cancelar mi asistencia" : "Pedir a RRHH no ir"}</SubmitButton>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Volver</button>
      </div>
    </ActionForm>
  );
}
