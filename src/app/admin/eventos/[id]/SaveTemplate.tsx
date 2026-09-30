"use client";

import { ActionForm } from "@/components/client";
import { useActionState, useState } from "react";
import { saveAsTemplate } from "@/app/actions";

export function SaveTemplate({ eventId, suggestion }: { eventId: string; suggestion: string }) {
  const [open, setOpen] = useState(false);
  const [msg, action, pending] = useActionState(saveAsTemplate.bind(null, eventId), null);
  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Guardar como plantilla
      </button>
    );
  }
  return (
    <ActionForm action={action} className="flex flex-wrap items-center gap-2">
      <input name="name" className="input w-56" defaultValue={suggestion} aria-label="Nombre de la plantilla" required autoFocus />
      <button className="btn btn-primary" disabled={pending}>Guardar</button>
      {msg && <span className="text-sm text-stone-600">{msg}</span>}
    </ActionForm>
  );
}
