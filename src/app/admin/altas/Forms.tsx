"use client";

import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { type PickerWorker, WorkerPicker } from "@/components/WorkerPicker";
import { CONTRACT_TYPES, END_REASONS } from "@/lib/employmentTypes";
import { endEmployment, importEmployments, saveEmployment } from "./actions";

export function EmploymentForm({ workers, defaultWorkerId }: { workers: PickerWorker[]; defaultWorkerId?: string }) {
  const [msg, run] = useActionState(saveEmployment, null);
  return (
    <ActionForm action={run} className="grid gap-3 sm:grid-cols-3">
      <div className="text-sm sm:col-span-3">Persona<WorkerPicker workers={workers} defaultId={defaultWorkerId} required /></div>
      <label className="text-sm">Fecha de alta<input name="startDate" type="date" className="input mt-1" required /></label>
      <label className="text-sm">Fecha de baja prevista (opcional)<input name="endDate" type="date" className="input mt-1" /></label>
      <label className="text-sm">Tipo de contrato
        <select name="contractType" className="input mt-1">{CONTRACT_TYPES.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="text-sm">Categoría<input name="category" className="input mt-1" placeholder="Camarero, ayudante…" /></label>
      <label className="text-sm">Horas semanales<input name="hoursPerWeek" inputMode="decimal" className="input mt-1" /></label>
      <label className="text-sm">Observaciones<input name="notes" className="input mt-1" /></label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <SubmitButton>Registrar alta</SubmitButton>
        {msg && <span className="text-sm text-stone-700">{msg}</span>}
      </div>
    </ActionForm>
  );
}

export function EndForm({ id, defaultDate }: { id: string; defaultDate: string }) {
  const [msg, run] = useActionState(endEmployment.bind(null, id), null);
  return (
    <ActionForm action={run} className="flex flex-wrap items-end gap-2">
      <input name="endDate" type="date" className="input w-40" defaultValue={defaultDate} aria-label="Fecha de baja" />
      <select name="endReason" className="input w-56" aria-label="Motivo">{END_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      <SubmitButton className="btn btn-sm">Dar de baja</SubmitButton>
      {msg && <span className="text-xs text-stone-700">{msg}</span>}
    </ActionForm>
  );
}

const STATUS = { nuevo: "text-emerald-700", actualizar: "text-sky-700", error: "text-red-600" } as const;

export function ImportForm() {
  const [state, run] = useActionState(importEmployments, null);
  const ok = state?.rows?.filter((r) => r.status !== "error").length ?? 0;
  return (
    <ActionForm action={run} className="space-y-4">
      <div className="card space-y-2">
        <input name="file" type="file" accept=".xlsx,.csv" required className="text-sm" />
        <p className="text-xs text-stone-500">
          Se reconocen columnas como «Nombre», «Apellidos», «DNI», «NSS», «Teléfono», «Fecha alta», «Fecha baja», «Tipo de contrato», «Categoría», «Horas», «Motivo baja» y «Observaciones».
          Se identifica a cada persona por DNI, teléfono o nombre. Si alguien no está en Personal y la fila tiene teléfono, se le da de alta.
        </p>
        <SubmitButton className="btn">Revisar</SubmitButton>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.done && <p className="card bg-emerald-50 text-emerald-900">{state.done}</p>}
      {state?.rows && (
        <div className="space-y-3">
          <p className="text-sm">
            Columnas: {state.columns?.map((c) => `${c.header || "(vacía)"} → ${c.field ?? "no se usa"}`).join(" · ")}
          </p>
          <div className="card overflow-x-auto p-0">
            <table className="table text-sm">
              <thead><tr><th>Fila</th><th>Persona</th><th>Alta</th><th>Baja</th><th>Contrato</th><th>Estado</th></tr></thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.workerName ?? r.name}{!r.workerId && r.createWorker && <span className="ml-1 text-xs text-sky-700">(nueva en Personal)</span>}{r.dni && <span className="text-stone-400"> · {r.dni}</span>}</td>
                    <td>{r.startDate ?? "—"}</td>
                    <td>{r.endDate ?? ""}</td>
                    <td>{r.contractType}</td>
                    <td className={STATUS[r.status]}>{r.status === "nuevo" ? "Nueva" : r.status === "actualizar" ? "Actualizar" : "Error"}{r.message ? `: ${r.message}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ok > 0 && (
            <button type="submit" name="mode" value="commit" className="btn btn-primary">Importar {ok} filas</button>
          )}
        </div>
      )}
    </ActionForm>
  );
}
