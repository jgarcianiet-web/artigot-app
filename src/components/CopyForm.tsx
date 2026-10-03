"use client";

import { useActionState } from "react";

/** Copiar un evento o un borrador como borrador en otro día (y las semanas siguientes). */
export function CopyForm({ action, defaultDate, hasStaff }: { action: (prev: string | null, form: FormData) => Promise<string | null>; defaultDate: string; hasStaff: boolean }) {
  const [msg, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="flex flex-wrap items-end gap-2 text-sm">
      <label>
        Día
        <input type="date" name="date" defaultValue={defaultDate} className="input mt-1 w-40" required />
      </label>
      <label>
        Repetir
        <select name="weeks" className="input mt-1 w-40" defaultValue="1">
          <option value="1">solo ese día</option>
          {[2, 3, 4, 6, 8, 12].map((n) => (
            <option key={n} value={n}>{n} semanas seguidas</option>
          ))}
        </select>
      </label>
      {hasStaff && (
        <label className="flex items-center gap-1.5 pb-2">
          <input type="checkbox" name="staff" value="1" defaultChecked className="size-4" /> con el mismo personal
        </label>
      )}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Copiando…" : "⧉ Copiar como borrador"}</button>
      {msg && <p className="w-full text-red-700">{msg}</p>}
    </form>
  );
}
