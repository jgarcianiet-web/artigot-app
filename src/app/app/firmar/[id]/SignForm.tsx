"use client";

import { useActionState } from "react";
import { signContract } from "@/app/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import { SignaturePad } from "@/components/SignaturePad";

export function SignForm({ id, kind }: { id: string; kind: string }) {
  const [r, run] = useActionState(signContract.bind(null, id), null);
  if (r?.ok) {
    return (
      <div className="card space-y-2 bg-emerald-50">
        <p className="text-emerald-900">{r.message}</p>
        <a href={`/api/contracts/${id}/pdf`} target="_blank" className="btn">Descargar PDF firmado</a>
      </div>
    );
  }
  return (
    <ActionForm action={run} className="card space-y-3">
      <SignaturePad />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" value="1" className="mt-0.5 size-4" required />
        {kind === "RGPD"
          ? "He leído y entendido la información sobre protección de datos."
          : kind === "JORNADA"
            ? "He revisado mi registro de jornada de este mes."
            : "He leído el documento y estoy conforme con las condiciones."}
      </label>
      {kind === "JORNADA" && (
        <label className="block text-sm">
          Observaciones (opcional)
          <textarea name="note" rows={2} maxLength={1000} className="input mt-1 text-base" placeholder="Si alguna hora no es correcta, indícalo aquí. RRHH lo revisará." />
        </label>
      )}
      {r && !r.ok && <p className="text-sm text-red-600">{r.message}</p>}
      <SubmitButton>Firmar</SubmitButton>
    </ActionForm>
  );
}
