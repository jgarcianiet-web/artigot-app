"use client";

import { useActionState } from "react";
import { saveClient } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";

type Client = { id: string; name: string; contact: string | null; phone: string | null; email: string | null; notes: string | null };

export function ClientForm({ client }: { client?: Client }) {
  const [error, action] = useActionState(saveClient, null);
  return (
    <ActionForm action={action} className="card max-w-2xl space-y-4">
      {client && <input type="hidden" name="id" value={client.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Nombre</label>
          <input name="name" className="input" defaultValue={client?.name} required />
        </div>
        <div>
          <label className="label">Persona de contacto</label>
          <input name="contact" className="input" defaultValue={client?.contact ?? ""} />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input name="phone" type="tel" className="input" defaultValue={client?.phone ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Email</label>
          <input name="email" type="email" className="input" defaultValue={client?.email ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notas internas</label>
          <textarea name="notes" rows={3} className="input" defaultValue={client?.notes ?? ""} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <SubmitButton>{client ? "Guardar cambios" : "Crear cliente"}</SubmitButton>
    </ActionForm>
  );
}
