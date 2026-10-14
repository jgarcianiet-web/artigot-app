"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ActionForm, useSubmitting } from "@/components/client";
import { ROLE_LABEL, ROLES } from "@/lib/domain";
import { importFromA3 } from "./actions";

export function ImportA3() {
  const [res, run] = useActionState(importFromA3, null);
  return (
    <ActionForm action={run} className="card max-w-3xl space-y-3">
      <input type="file" name="file" accept=".xlsx,.xlsm,.csv" required className="block text-sm" />
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <div>
          <label className="label" htmlFor="defaultRole">Puesto de los nuevos (si A3 no lo trae)</label>
          <select id="defaultRole" name="defaultRole" className="input w-auto" defaultValue="CAMARERO">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <label className="flex items-start gap-2 pb-2">
          <input type="checkbox" name="replaceRates" value="1" className="mt-0.5 size-4 shrink-0" />
          <span>Sustituir las tarifas propias que ya tengan</span>
        </label>
      </div>
      {res && (
        <div className={`rounded-lg p-3 text-sm ${!res.ok ? "bg-red-50 text-red-800" : res.preview ? "bg-sky-50 text-sky-900" : "bg-emerald-50 text-emerald-900"}`}>
          <p>{res.message}</p>
          {res.details && res.details.length > 0 && (
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-xs">{res.details.join("\n")}</pre>
          )}
          {res.ok && !res.preview && (
            <p className="mt-2 flex flex-wrap gap-2">
              <Link href="/admin/personal" className="btn btn-sm">Ver personal</Link>
              <Link href="/admin/personal/avisos" className="btn btn-sm">Mandarles el acceso por WhatsApp</Link>
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Step intent="preview" className="btn">1. Revisar</Step>
        {res?.ok && res.preview && <Step intent="import" className="btn btn-primary">2. Importar</Step>}
      </div>
    </ActionForm>
  );
}

function Step({ intent, className, children }: { intent: string; className: string; children: React.ReactNode }) {
  const pending = useSubmitting();
  return (
    <button type="submit" name="intent" value={intent} className={className} disabled={pending}>
      {pending ? "Un momento…" : children}
    </button>
  );
}
