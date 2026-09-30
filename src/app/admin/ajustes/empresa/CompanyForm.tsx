"use client";

import { useActionState, useRef } from "react";
import { saveCompany } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";

type Company = { name: string; cif: string; address: string; city: string; agreement: string; template: string };

const MARKERS = "{{empresa}} {{cif}} {{domicilio}} {{ciudad}} {{hoy}} {{trabajador}} {{dni}} {{nss}} {{puesto}} {{evento}} {{fecha}} {{lugar}} {{citacion}} {{fin}} {{tarifa}} {{minimo}} {{convenio}}";

export function CompanyForm({ company, defaultTemplate }: { company: Company; defaultTemplate: string }) {
  const [msg, run] = useActionState(saveCompany, null);
  const tpl = useRef<HTMLTextAreaElement>(null);
  return (
    <ActionForm action={run} className="card max-w-4xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Razón social<input name="name" className="input mt-1" defaultValue={company.name} /></label>
        <label className="text-sm">CIF<input name="cif" className="input mt-1" defaultValue={company.cif} /></label>
        <label className="text-sm">Domicilio<input name="address" className="input mt-1" defaultValue={company.address} /></label>
        <label className="text-sm">Ciudad (para «En …, a …»)<input name="city" className="input mt-1" defaultValue={company.city} /></label>
        <label className="text-sm sm:col-span-2">Convenio colectivo aplicable<input name="agreement" className="input mt-1" defaultValue={company.agreement} /></label>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="template">Texto del documento de condiciones</label>
          <button type="button" className="text-xs text-stone-500 underline" onClick={() => tpl.current && (tpl.current.value = defaultTemplate)}>
            Restaurar el texto por defecto
          </button>
        </div>
        <textarea ref={tpl} id="template" name="template" rows={22} className="input font-mono text-xs" defaultValue={company.template} />
        <p className="mt-1 text-xs text-stone-500">Marcadores disponibles: {MARKERS}</p>
      </div>
      <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
        El texto por defecto es orientativo. Pide a vuestra asesoría laboral que lo revise y adapte a vuestro tipo de contrato y convenio antes de usarlo.
      </p>
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
      <SubmitButton>Guardar</SubmitButton>
    </ActionForm>
  );
}
