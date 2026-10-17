"use client";

import Link from "next/link";
import { FileLink } from "@/components/FileLink";
import { useActionState } from "react";
import { signContract } from "@/app/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import { SignaturePad } from "@/components/SignaturePad";

export function SignForm({ id, kind, medicalChoice = true }: { id: string; kind: string; medicalChoice?: boolean }) {
  const [r, run] = useActionState(signContract.bind(null, id), null);
  if (r?.ok) {
    return (
      <div className="card space-y-2 bg-emerald-50">
        <p className="text-emerald-900">{r.message}</p>
        <FileLink href={`/api/contracts/${id}/pdf`} className="btn">Ver PDF firmado</FileLink>
        {kind.startsWith("PRL_") && <Link href="/app" className="btn btn-primary">Seguir ›</Link>}
      </div>
    );
  }
  return (
    <ActionForm action={run} className="card space-y-3">
      {kind === "PRL_RECONOCIMIENTO" && !medicalChoice && (
        <p className="rounded-lg bg-stone-100 p-3 text-sm">
          ☒ <strong>NO DESEO</strong> pasar el reconocimiento médico (es lo que corresponde al personal extra y a los mozos).
        </p>
      )}
      {kind === "PRL_RECONOCIMIENTO" && medicalChoice && (
        <fieldset className="space-y-1.5 text-sm">
          <legend className="mb-1 font-medium">Reconocimiento médico</legend>
          <label className="flex items-center gap-2"><input type="radio" name="choice" value="NO" required className="size-4" /> NO DESEO pasar el reconocimiento médico</label>
          <label className="flex items-center gap-2"><input type="radio" name="choice" value="SI" required className="size-4" /> SÍ DESEO pasar el reconocimiento médico</label>
        </fieldset>
      )}
      <SignaturePad />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" value="1" className="mt-0.5 size-4" required />
        {kind === "RGPD"
          ? "He leído y entendido la información sobre protección de datos."
          : kind === "JORNADA"
            ? "He revisado mi registro de jornada de este mes."
            : kind.startsWith("PRL_")
              ? "He leído el documento y declaro que es correcto."
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
