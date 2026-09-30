"use client";

import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { ROLE_LABEL, ROLES } from "@/lib/domain";
import { createPoll } from "./actions";

const DAYS = [
  [1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"],
] as const;

export function PollForm({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [msg, run] = useActionState(createPoll, null);
  return (
    <ActionForm action={run} className="card space-y-3">
      <h2>Nuevo sondeo</h2>
      <label className="block text-sm">Título (opcional)<input name="title" className="input mt-1" placeholder="Bodas de mayo" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Desde<input name="from" type="date" className="input mt-1" defaultValue={defaultFrom} required /></label>
        <label className="text-sm">Hasta<input name="to" type="date" className="input mt-1" defaultValue={defaultTo} required /></label>
      </div>
      <fieldset>
        <legend className="label">Días de la semana</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {DAYS.map(([n, l]) => (
            <label key={n} className="flex items-center gap-1"><input type="checkbox" name="weekday" value={n} defaultChecked={n === 5 || n === 6 || n === 0} /> {l}</label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Para (sin marcar = todo el personal)</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {ROLES.map((r) => <label key={r} className="flex items-center gap-1"><input type="checkbox" name="roles" value={r} /> {ROLE_LABEL[r]}</label>)}
        </div>
      </fieldset>
      <label className="block text-sm">Mensaje (opcional)<textarea name="message" rows={2} className="input mt-1" placeholder="Temporada alta: marca todos los días que puedas." /></label>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <SubmitButton>Enviar sondeo</SubmitButton>
    </ActionForm>
  );
}
