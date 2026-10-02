"use client";

import { useActionState } from "react";
import { saveA3 } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import { ROLE_LABEL, ROLES } from "@/lib/domain";
import type { A3Config } from "@/lib/a3";

export function A3Form({ cfg }: { cfg: A3Config }) {
  const [msg, run] = useActionState(saveA3, null);
  return (
    <ActionForm action={run} className="card max-w-3xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">Código de empresa en A3<input name="companyCode" className="input mt-1" defaultValue={cfg.companyCode || "29"} required /></label>
        <label className="text-sm">Código de concepto (horas)<input name="hoursConcept" className="input mt-1" defaultValue={cfg.hoursConcept} required /></label>
        <label className="text-sm">Nombre del concepto<input name="hoursConceptName" className="input mt-1" defaultValue={cfg.hoursConceptName} /></label>
      </div>
      <fieldset>
        <legend className="label">Concepto distinto por puesto (opcional)</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {ROLES.map((r) => (
            <label key={r} className="text-sm">{ROLE_LABEL[r]}<input name={`concept_${r}`} className="input mt-1" defaultValue={cfg.roleConcepts[r] ?? ""} placeholder={cfg.hoursConcept || "—"} /></label>
          ))}
        </div>
      </fieldset>
      <label className="block max-w-sm text-sm">
        Código de concepto del plus por evento (opcional)
        <input name="bonusConcept" className="input mt-1" defaultValue={cfg.bonusConcept} placeholder={cfg.hoursConcept || "—"} />
        <span className="text-xs text-stone-500">El plus (p. ej. del camarero responsable) va en una línea aparte: unidades = servicios.</span>
      </label>
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
      <SubmitButton>Guardar</SubmitButton>
    </ActionForm>
  );
}
