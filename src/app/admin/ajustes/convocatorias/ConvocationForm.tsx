"use client";

import { useActionState } from "react";
import { saveConvocationAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import type { ConvocationSettings } from "@/lib/convocation";

export function ConvocationForm({ s }: { s: ConvocationSettings }) {
  const [msg, run] = useActionState(saveConvocationAction, null);
  return (
    <ActionForm action={run} className="card max-w-2xl space-y-4">
      <p className="text-sm text-stone-600">Las horas se cuentan desde que se manda la convocatoria (o se vuelve a mandar).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Recordar al trabajador a las (horas)<input name="remindHours" type="number" min={1} max={168} className="input mt-1" defaultValue={s.remindHours} /></label>
        <label className="text-sm">Avisar a RRHH a las (horas)<input name="rrhhHours" type="number" min={1} max={168} className="input mt-1" defaultValue={s.rrhhHours} /></label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="replace" value="1" defaultChecked={s.replace} className="mt-0.5 size-4 shrink-0" />
        <span>Si sigue sin contestar, darla por rechazada y convocar al siguiente mejor puntuado del mismo puesto (en los eventos con «Reposición automática»)</span>
      </label>
      <label className="block max-w-xs text-sm">Pasar al siguiente a las (horas)<input name="replaceHours" type="number" min={1} max={336} className="input mt-1" defaultValue={s.replaceHours} /></label>
      {msg && <p className="text-sm">{msg}</p>}
      <SubmitButton>Guardar</SubmitButton>
    </ActionForm>
  );
}
