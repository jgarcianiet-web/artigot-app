"use client";

import { useActionState } from "react";
import { WorkerChooser, type ChooserWorker } from "@/components/WorkerChooser";
import { saveGroupAction } from "../actions";

/** Crear o editar un grupo con el personal: nombre, «solo RRHH escribe» y a quién se añade (buscando o por puesto). */
export function GroupForm({ workers, group }: { workers: ChooserWorker[]; group?: { id: string; name: string; onlyStaff: boolean; memberIds: string[] } }) {
  const [msg, run, pending] = useActionState(saveGroupAction, null);
  return (
    <form action={run} className="space-y-4">
      {group && <input type="hidden" name="id" value={group.id} />}
      <div className="card space-y-3">
        <label className="block text-sm font-medium">
          Nombre del grupo
          <input name="name" className="input mt-1" defaultValue={group?.name} placeholder="P. ej. Maîtres, Fijos Segovia, Bodas sábado…" required maxLength={60} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="onlyStaff" defaultChecked={group?.onlyStaff} className="mt-0.5 size-4" />
          <span>
            <span className="font-medium">Solo RRHH puede escribir</span>
            <span className="block text-xs text-stone-500">Para avisos: el personal lo lee pero no puede contestar en el grupo (sí por su chat privado con RRHH).</span>
          </span>
        </label>
      </div>

      <WorkerChooser workers={workers} initial={group?.memberIds} title="Personas del grupo" />
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{group ? "Guardar cambios" : "Crear grupo"}</button>
    </form>
  );
}
