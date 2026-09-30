"use client";

import { useActionState, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { generateRemittance, importNets, saveNets, setPayDate, type PayResult } from "./actions";

const Msg = ({ r }: { r: PayResult }) =>
  r ? <p className={`text-sm ${r.ok ? "text-emerald-700" : "text-red-600"}`}>{r.message}</p> : null;

export function PayDateForm({ k, payDate, disabled }: { k: string; payDate: string; disabled: boolean }) {
  const [r, run] = useActionState(setPayDate.bind(null, k), null);
  return (
    <ActionForm action={run} className="space-y-2">
      <label className="label" htmlFor="payDate">Fecha estimada de pago</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id="payDate" name="payDate" type="date" className="input w-44" defaultValue={payDate} disabled={disabled} />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="notify" value="1" defaultChecked disabled={disabled} /> Avisar al personal</label>
        {!disabled && <SubmitButton className="btn">Guardar fecha</SubmitButton>}
      </div>
      <Msg r={r} />
    </ActionForm>
  );
}

type Row = { workerId: string; name: string; net: number; netEstimate: number; final: boolean };

export function NetsForm({ k, rows, children }: { k: string; rows: Row[]; children: React.ReactNode }) {
  const [r, run] = useActionState(saveNets.bind(null, k), null);
  return (
    <ActionForm action={run} className="space-y-2">
      {children}
      <div className="flex items-center justify-end gap-3">
        <Msg r={r} />
        {rows.length > 0 && <SubmitButton>Guardar netos</SubmitButton>}
      </div>
    </ActionForm>
  );
}

export function ImportNetsForm({ k }: { k: string }) {
  const [r, run] = useActionState(importNets.bind(null, k), null);
  return (
    <ActionForm action={run} className="space-y-2">
      <p className="text-sm text-stone-600">
        Sube el listado de nóminas de A3 (Excel o CSV). Se busca una columna con el DNI/NIF o el código de trabajador y otra con el líquido a percibir.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input name="file" type="file" accept=".xlsx,.csv" className="text-sm" required />
        <SubmitButton className="btn">Importar netos</SubmitButton>
      </div>
      <Msg r={r} />
    </ActionForm>
  );
}

export function RemittanceForm({ k, pending }: { k: string; pending: number }) {
  const [r, run] = useActionState(generateRemittance.bind(null, k), null);
  const [force, setForce] = useState(false);
  return (
    <ActionForm action={run} className="space-y-2">
      {pending > 0 && (
        <label className="flex items-center gap-2 text-sm text-amber-800">
          <input type="checkbox" name="force" value="1" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Generar igualmente ({pending} servicios sin horas no se pagarán en esta remesa)
        </label>
      )}
      <SubmitButton>🏦 Generar remesa bancaria</SubmitButton>
      <Msg r={r} />
      {r?.ok && r.remittanceId && (
        <a href={`/admin/pagos/remesa/${r.remittanceId}`} className="btn btn-primary">⬇ Descargar fichero de la remesa</a>
      )}
    </ActionForm>
  );
}
