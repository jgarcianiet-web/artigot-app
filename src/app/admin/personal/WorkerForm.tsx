"use client";

import { useActionState } from "react";
import { saveWorker } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import { ROLE_LABEL, ROLES } from "@/lib/domain";

type Worker = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  roles: string[];
  rating: number;
  zone: string | null;
  notes: string | null;
  dni: string | null;
  nss: string | null;
  iban: string | null;
  birthDate: string | null;
  address: string | null;
  a3Code: string | null;
  irpf: number | null;
};

export function WorkerForm({ worker }: { worker?: Worker }) {
  const [error, action] = useActionState(saveWorker, null);
  return (
    <ActionForm action={action} className="card max-w-2xl space-y-4">
      {worker && <input type="hidden" name="id" value={worker.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Nombre y apellidos</label>
          <input name="name" className="input" defaultValue={worker?.name} required />
        </div>
        <div>
          <label className="label">Teléfono (WhatsApp)</label>
          <input name="phone" type="tel" className="input" defaultValue={worker?.phone} required placeholder="600 123 456" />
        </div>
        <div>
          <label className="label">Email (opcional)</label>
          <input name="email" type="email" className="input" defaultValue={worker?.email ?? ""} />
        </div>
        <div>
          <label className="label">Puesto principal</label>
          <select name="role" className="input" defaultValue={worker?.role ?? "CAMARERO"}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" title="Punto de partida de la puntuación; luego mandan las valoraciones de los maîtres">Valoración inicial de RRHH</label>
          <select name="rating" className="input" defaultValue={worker?.rating ?? 3}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{"★".repeat(n)} ({n})</option>
            ))}
          </select>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="label">También puede trabajar como</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roles" value={r} defaultChecked={worker?.roles.includes(r)} className="size-4" />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">
            El puesto en cada evento se elige al convocar: p. ej. un camarero puede ir como camarero responsable en un evento pequeño y como maître en otro.
          </p>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="label">Zona / localidad (opcional)</label>
          <input name="zone" className="input" defaultValue={worker?.zone ?? ""} placeholder="p. ej. Valencia centro, tiene coche" />
        </div>
        <fieldset className="grid gap-4 rounded-lg border border-stone-200 p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Datos laborales (también los puede completar el trabajador en su app)</legend>
          <div>
            <label className="label">DNI / NIE</label>
            <input name="dni" className="input" defaultValue={worker?.dni ?? ""} />
          </div>
          <div>
            <label className="label">Nº Seguridad Social</label>
            <input name="nss" inputMode="numeric" className="input" defaultValue={worker?.nss ?? ""} />
          </div>
          <div>
            <label className="label">IBAN</label>
            <input name="iban" className="input" defaultValue={worker?.iban ?? ""} />
          </div>
          <div>
            <label className="label">Fecha de nacimiento</label>
            <input name="birthDate" type="date" className="input" defaultValue={worker?.birthDate ?? ""} />
          </div>
          <div>
            <label className="label">Dirección</label>
            <input name="address" className="input" defaultValue={worker?.address ?? ""} />
          </div>
          <div>
            <label className="label">Código de trabajador en A3</label>
            <input name="a3Code" className="input" defaultValue={worker?.a3Code ?? ""} />
          </div>
          <div>
            <label className="label">IRPF (%)</label>
            <input name="irpf" inputMode="decimal" className="input" defaultValue={worker?.irpf != null ? String(worker.irpf).replace(".", ",") : ""} placeholder="El general de Ajustes" />
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="label">Notas (opcional)</label>
          <textarea name="notes" className="input" rows={3} defaultValue={worker?.notes ?? ""} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <SubmitButton>{worker ? "Guardar cambios" : "Crear trabajador"}</SubmitButton>
    </ActionForm>
  );
}
