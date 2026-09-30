"use client";

import { useActionState } from "react";
import { savePaySettings } from "@/app/admin/pagos/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import type { PaySettings } from "@/lib/pay";

const dec = (n: number) => String(n).replace(".", ",");

export function PaySettingsForm({ s }: { s: PaySettings }) {
  const [msg, run] = useActionState(savePaySettings, null);
  return (
    <ActionForm action={run} className="card max-w-3xl space-y-5">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Neto que ve el personal</legend>
        <label className="text-sm">Seguridad Social a cargo del trabajador (%)<input name="ssPct" inputMode="decimal" className="input mt-1" defaultValue={dec(s.ssPct)} /></label>
        <label className="text-sm">IRPF general (%)<input name="irpfPct" inputMode="decimal" className="input mt-1" defaultValue={dec(s.irpfPct)} /></label>
        <p className="text-xs text-stone-500 sm:col-span-2">
          Por defecto 6,55 % (contingencias comunes 4,70 + desempleo temporal 1,60 + formación 0,10 + MEI 0,15) y 2 % de IRPF, el mínimo para contratos de menos de un año.
          Cada trabajador puede tener su propio IRPF en su ficha. Revisadlo con vuestra asesoría.
        </p>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Días de pago (quincena vencida)</legend>
        <label className="text-sm">Quincena 1–15: se paga el día (mismo mes)<input name="firstHalfDay" type="number" min={1} max={31} className="input mt-1" defaultValue={s.firstHalfDay} /></label>
        <label className="text-sm">Quincena 16–fin: se paga el día (mes siguiente)<input name="secondHalfDay" type="number" min={1} max={31} className="input mt-1" defaultValue={s.secondHalfDay} /></label>
        <p className="text-xs text-stone-500 sm:col-span-2">Si cae en sábado o domingo, pasa al lunes. En cada quincena se puede cambiar la fecha desde Pagos.</p>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Cuenta de la empresa (remesas SEPA)</legend>
        <label className="text-sm sm:col-span-2">IBAN<input name="debtorIban" className="input mt-1 font-mono" defaultValue={s.debtorIban} placeholder="ES00 0000 0000 0000 0000 0000" /></label>
        <label className="text-sm">BIC (opcional)<input name="debtorBic" className="input mt-1 font-mono" defaultValue={s.debtorBic} /></label>
        <label className="text-sm">Sufijo del ordenante<input name="sepaSuffix" className="input mt-1 font-mono" defaultValue={s.sepaSuffix} maxLength={3} /></label>
        <p className="text-xs text-stone-500 sm:col-span-2">El sufijo lo da el banco al contratar el servicio de remesas (casi siempre 000). La razón social y el CIF se toman de Ajustes → Empresa y contratos.</p>
      </fieldset>
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
      <SubmitButton>Guardar</SubmitButton>
    </ActionForm>
  );
}
