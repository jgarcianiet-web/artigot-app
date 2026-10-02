"use client";

import { useActionState } from "react";

type W = { id: string; name: string; active: boolean; detail: string };

export function MergeForm({ action, dni, workers }: { action: (prev: string | null, form: FormData) => Promise<string | null>; dni: string; workers: W[] }) {
  const [msg, run, pending] = useActionState(action, null);
  // Por defecto se queda la que más servicios tiene
  const best = [...workers].sort((a, b) => Number(b.detail.match(/(\d+) servicios/)?.[1] ?? 0) - Number(a.detail.match(/(\d+) servicios/)?.[1] ?? 0))[0];
  return (
    <form
      action={run}
      className="card space-y-2"
      onSubmit={(e) => {
        if (!confirm("¿Unir estas fichas? La que no se queda se borra (todo lo suyo pasa a la otra). No se puede deshacer.")) e.preventDefault();
      }}
    >
      <h2 className="text-base">DNI {dni}</h2>
      <ul className="space-y-1">
        {workers.map((w) => (
          <li key={w.id}>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="keep" value={w.id} defaultChecked={w.id === best.id} className="mt-1" />
              <span>
                <a href={`/admin/personal/${w.id}`} target="_blank" className="link font-medium">{w.name}</a>
                {!w.active && <span className="ml-1 text-xs text-stone-500">(de baja)</span>}
                <span className="block text-xs text-stone-500">{w.detail}</span>
              </span>
            </label>
            <input type="hidden" name="ids" value={w.id} />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Uniendo…" : "Unir: se queda la marcada"}</button>
        {msg && <span className="text-sm text-stone-700">{msg}</span>}
      </div>
    </form>
  );
}
