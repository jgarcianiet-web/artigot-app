"use client";

import { useActionState } from "react";
import { saveCompany } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";

type Company = { name: string; cif: string; address: string; city: string; agreement: string; template: string };

export function CompanyForm({ company }: { company: Company }) {
  const [msg, run] = useActionState(saveCompany, null);
  return (
    <ActionForm action={run} className="card max-w-4xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Razón social<input name="name" className="input mt-1" defaultValue={company.name} /></label>
        <label className="text-sm">CIF<input name="cif" className="input mt-1" defaultValue={company.cif} /></label>
        <label className="text-sm">Domicilio<input name="address" className="input mt-1" defaultValue={company.address} /></label>
        <label className="text-sm">Ciudad (para «En …, a …»)<input name="city" className="input mt-1" defaultValue={company.city} /></label>
        <label className="text-sm sm:col-span-2">Convenio colectivo aplicable<input name="agreement" className="input mt-1" defaultValue={company.agreement} /></label>
      </div>
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
      <SubmitButton>Guardar</SubmitButton>
    </ActionForm>
  );
}
