"use client";

import { useActionState } from "react";
import { saveEvent } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { LocationPicker } from "@/components/LocationPicker";
import { EVENT_TYPE_LABEL, EVENT_TYPES } from "@/lib/domain";

type Event = {
  id: string;
  name: string;
  type: string;
  date: string;
  startTime: string;
  endTime: string | null;
  unloadTime: string | null;
  venue: string;
  lat: number | null;
  lng: number | null;
  client: string | null;
  notes: string | null;
  needCamareros: number;
  needMaitres: number;
  needMozos: number;
};

export function EventForm({ event, radius, defaultDate }: { event?: Event; radius: number; defaultDate?: string }) {
  const [error, action] = useActionState(saveEvent, null);
  return (
    <form action={action} className="card max-w-3xl space-y-5">
      {event && <input type="hidden" name="id" value={event.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label">Nombre del evento</label>
          <input name="name" className="input" defaultValue={event?.name} required placeholder="Boda Laura y Pablo" />
        </div>
        <div>
          <label className="label">Tipo</label>
          <select name="type" className="input" defaultValue={event?.type ?? "BODA"}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Fecha</label>
          <input name="date" type="date" className="input" defaultValue={event?.date ?? defaultDate} required />
        </div>
        <div>
          <label className="label">Hora de servicio</label>
          <input name="startTime" type="time" className="input" defaultValue={event?.startTime ?? "18:00"} required />
        </div>
        <div>
          <label className="label">Hora de fin</label>
          <input name="endTime" type="time" className="input" defaultValue={event?.endTime ?? ""} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Lugar / finca</label>
          <input name="venue" className="input" defaultValue={event?.venue} required />
        </div>
        <div>
          <label className="label">Cliente (opcional)</label>
          <input name="client" className="input" defaultValue={event?.client ?? ""} />
        </div>
      </div>

      <fieldset className="rounded-lg border border-stone-200 p-4">
        <legend className="px-1 text-sm font-semibold">Ubicación para el fichaje</legend>
        <p className="mb-2 text-xs text-stone-500">
          El personal solo puede fichar a menos de {radius} m de este punto, desde 30 min antes de su citación hasta 30 min después de la hora de fin.
        </p>
        <LocationPicker
          initial={event?.lat != null && event?.lng != null ? { lat: event.lat, lng: event.lng } : null}
          radius={radius}
        />
      </fieldset>

      <fieldset className="rounded-lg border border-stone-200 p-4">
        <legend className="px-1 text-sm font-semibold">Personal necesario</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Camareros</label>
            <input name="needCamareros" type="number" min={0} className="input" defaultValue={event?.needCamareros ?? 0} />
          </div>
          <div>
            <label className="label">Maîtres</label>
            <input name="needMaitres" type="number" min={0} className="input" defaultValue={event?.needMaitres ?? 0} />
          </div>
          <div>
            <label className="label">Mozos</label>
            <input name="needMozos" type="number" min={0} className="input" defaultValue={event?.needMozos ?? 0} />
          </div>
          <div>
            <label className="label">Hora descarga (mozos)</label>
            <input name="unloadTime" type="time" className="input" defaultValue={event?.unloadTime ?? ""} />
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-500">Si indicas hora de descarga, los mozos serán citados a esa hora en lugar de a la hora de servicio.</p>
      </fieldset>

      <div>
        <label className="label">Notas para el personal (uniforme, parking, menú…)</label>
        <textarea name="notes" className="input" rows={3} defaultValue={event?.notes ?? ""} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <SubmitButton>{event ? "Guardar cambios" : "Crear evento"}</SubmitButton>
    </form>
  );
}
