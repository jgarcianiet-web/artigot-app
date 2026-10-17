"use client";

import { useActionState } from "react";
import { fixMyBirthDate, signTutorAuthorization } from "@/app/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import { SignaturePad } from "@/components/SignaturePad";
import { TUTOR_RELATIONS } from "@/lib/tutorRelations";

export function TutorForm() {
  const [r, run] = useActionState(signTutorAuthorization, null);
  return (
    <ActionForm action={run} className="card space-y-3">
      <h2>Datos del padre, madre o tutor</h2>
      <label className="block text-sm">
        Nombre y apellidos
        <input name="tutorName" required autoComplete="off" className="input mt-1 text-base" />
      </label>
      <label className="block text-sm">
        DNI / NIE
        <input name="tutorDni" required autoComplete="off" autoCapitalize="characters" className="input mt-1 text-base uppercase" />
      </label>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1">Es tu…</legend>
        {TUTOR_RELATIONS.map((r) => (
          <label key={r} className="flex items-center gap-1.5">
            <input type="radio" name="relation" value={r} required /> {r}
          </label>
        ))}
      </fieldset>
      <p className="text-sm font-medium">Firma del padre, madre o tutor</p>
      <SignaturePad />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" value="1" className="mt-0.5 size-4" required />
        He leído el texto de arriba y autorizo a mi hijo/a o tutelado/a a trabajar.
      </label>
      {r && !r.ok && <p className="text-sm text-red-600">{r.message}</p>}
      <SubmitButton>Firmar la autorización</SubmitButton>
    </ActionForm>
  );
}

export function FixBirthDate({ value }: { value: string }) {
  const [r, run] = useActionState(fixMyBirthDate, null);
  return (
    <ActionForm action={run} className="flex flex-wrap items-end gap-2 text-sm">
      <label>
        ¿La fecha de nacimiento está mal? Corrígela:
        <input name="birthDate" type="date" defaultValue={value} required className="input mt-1 text-base" />
      </label>
      <SubmitButton className="btn">Guardar fecha</SubmitButton>
      {r && !r.ok && <p className="w-full text-red-600">{r.message}</p>}
    </ActionForm>
  );
}
