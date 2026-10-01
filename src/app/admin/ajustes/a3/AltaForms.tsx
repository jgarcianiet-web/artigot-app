"use client";

import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import type { A3AltaConfig } from "@/lib/a3alta";
import { ROLE_LABEL, ROLES } from "@/lib/domain";
import { importA3DatabaseAction, saveA3AltaAction } from "./actions";

type Lists = { countries: string[]; education: string[]; contracts: string[]; occupations: string[]; tariffGroups: string[]; regimes: string[]; contributions: string[] };

function Pick({ name, label, value, options, wide }: { name: string; label: string; value: string; options: string[]; wide?: boolean }) {
  return (
    <label className={`text-sm ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <select name={name} className="input mt-1" defaultValue={value}>
        {!options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function A3AltaForm({ cfg, lists, next }: { cfg: A3AltaConfig; lists: Lists; next: number }) {
  const [msg, run] = useActionState(saveA3AltaAction, null);
  return (
    <ActionForm action={run} className="card max-w-3xl space-y-4">
      <div>
        <h2>Valores del alta masiva</h2>
        <p className="text-sm text-stone-500">Los mismos para todas las altas, como en vuestra exportación de A3. Cada trabajador pone sus datos personales.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">Centro<input name="center" className="input mt-1" defaultValue={cfg.center} /></label>
        <label className="text-sm">Convenio<input name="agreement" className="input mt-1" defaultValue={cfg.agreement} /></label>
        <label className="text-sm">Categoría<input name="category" className="input mt-1" defaultValue={cfg.category} /></label>
        <label className="text-sm">Puesto<input name="position" className="input mt-1" defaultValue={cfg.position} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick name="contractType" label="Tipo de contrato" value={cfg.contractType} options={lists.contracts} wide />
        <Pick name="tariffGroup" label="Grupo de tarifa" value={cfg.tariffGroup} options={lists.tariffGroups} />
        <Pick name="regime" label="Régimen" value={cfg.regime} options={lists.regimes} />
        <Pick name="contributionType" label="Tipo de cotización" value={cfg.contributionType} options={lists.contributions} />
        <Pick name="paymentType" label="Tipo de cobro" value={cfg.paymentType} options={["Mensual", "Diario"]} />
        <Pick name="grossType" label="Tipo bruto anual" value={cfg.grossType} options={["Indicar texto", "Según importe"]} />
        <Pick name="education" label="Nivel formativo (si el trabajador no lo indica)" value={cfg.education} options={lists.education} />
        <Pick name="nationality" label="Nacionalidad (si el trabajador no la indica)" value={cfg.nationality} options={lists.countries} />
      </div>
      <fieldset>
        <legend className="label">Ocupación (CNO) por puesto</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <Pick key={r} name={`occupation_${r}`} label={ROLE_LABEL[r]} value={cfg.occupation[r]} options={lists.occupations} />
          ))}
        </div>
      </fieldset>
      <label className="block max-w-xs text-sm">
        Último código de trabajador usado en A3
        <input name="lastCode" type="number" min={0} className="input mt-1" defaultValue={cfg.lastCode || ""} />
        <span className="text-xs text-stone-500">La próxima alta llevará el {next}. Se actualiza solo al importar la base de datos.</span>
      </label>
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
      <SubmitButton>Guardar</SubmitButton>
    </ActionForm>
  );
}

export function A3ImportForm({ title = "Importar la base de datos de A3", text }: { title?: string; text?: string }) {
  const [res, run] = useActionState(importA3DatabaseAction, null);
  return (
    <ActionForm action={run} className="card max-w-3xl space-y-3">
      <div>
        <h2>{title}</h2>
        <p className="text-sm text-stone-500">
          {text ??
            "Sube el Excel con la hoja «Base de Datos» (DNI, Nombre, CÓDIGO, NASS, CENTRO). Se busca a cada trabajador por DNI o por nombre y se completan su código de A3, NASS, centro y apellidos si no los tiene. No se cambia nada que ya esté relleno."}
        </p>
      </div>
      <input type="file" name="file" accept=".xlsx,.xlsm,.csv" required className="block text-sm" />
      {res && (
        <div className={`rounded-lg p-3 text-sm ${res.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
          <p>{res.message}</p>
          {res.details && res.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {res.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <SubmitButton>Importar</SubmitButton>
    </ActionForm>
  );
}
