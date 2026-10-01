"use client";

import { useActionState, useState } from "react";
import { saveEvent } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
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
  salesRep: string | null;
  budget: number | null;
  budgetNote: string | null;
  notes: string | null;
  checklist: string | null;
  needCamareros: number;
  needMaitres: number;
  needResponsables: number;
  autoReplace: boolean;
  needMozos: number;
  venueId: string | null;
  clientId: string | null;
};

export type VenueOption = { id: string; name: string; lat: number | null; lng: number | null; accessNotes: string | null };
export type ClientOption = { id: string; name: string };

export function EventForm({
  event,
  defaults,
  venues,
  clients,
  salesReps = [],
  radius,
  defaultDate,
}: {
  event?: Event;
  /** Valores iniciales de un evento nuevo (p. ej. desde una plantilla) */
  defaults?: Partial<Event>;
  venues: VenueOption[];
  clients: ClientOption[];
  salesReps?: string[];
  radius: number;
  defaultDate?: string;
}) {
  const [error, action] = useActionState(saveEvent, null);
  const v = { ...defaults, ...event };
  const [venueId, setVenueId] = useState(v.venueId ?? "");
  const [venueName, setVenueName] = useState(v.venue ?? "");
  const [clientId, setClientId] = useState(v.clientId ?? "");
  const [clientName, setClientName] = useState(v.client ?? "");
  const selectedVenue = venues.find((x) => x.id === venueId);
  const [point, setPoint] = useState(
    v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : selectedVenue?.lat != null && selectedVenue.lng != null ? { lat: selectedVenue.lat, lng: selectedVenue.lng } : null,
  );
  const [pickerKey, setPickerKey] = useState(0);

  return (
    <ActionForm action={action} className="card max-w-3xl space-y-5">
      {event && <input type="hidden" name="id" value={event.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label">Nombre del evento</label>
          <input name="name" className="input" defaultValue={v.name} required placeholder="Boda Laura y Pablo" />
        </div>
        <div>
          <label className="label">Tipo</label>
          <select name="type" className="input" defaultValue={v.type ?? "BODA"}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Fecha</label>
          <input name="date" type="date" className="input" defaultValue={v.date ?? defaultDate} required />
        </div>
        <div>
          <label className="label">Hora de servicio</label>
          <input name="startTime" type="time" className="input" defaultValue={v.startTime ?? "18:00"} required />
        </div>
        <div>
          <label className="label">Hora de fin</label>
          <input name="endTime" type="time" className="input" defaultValue={v.endTime ?? ""} required />
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-stone-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Lugar y cliente</legend>
        <div className="space-y-2">
          <label className="label" htmlFor="venueId">Finca guardada</label>
          <select
            id="venueId"
            name="venueId"
            className="input"
            value={venueId}
            onChange={(e) => {
              const chosen = venues.find((x) => x.id === e.target.value);
              setVenueId(e.target.value);
              if (chosen) {
                setVenueName(chosen.name);
                if (chosen.lat != null && chosen.lng != null) {
                  setPoint({ lat: chosen.lat, lng: chosen.lng });
                  setPickerKey((k) => k + 1);
                }
              }
            }}
          >
            <option value="">— Otra (escribir) —</option>
            {venues.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          <label className="label" htmlFor="venue">Lugar / finca</label>
          <input id="venue" name="venue" className="input" value={venueName} onChange={(e) => setVenueName(e.target.value)} required />
          {!venueId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="saveVenue" value="1" className="size-4" /> Guardar como finca para otros eventos
            </label>
          )}
          {selectedVenue?.accessNotes && (
            <p className="rounded bg-stone-100 p-2 text-xs text-stone-600">
              <strong>Indicaciones de la finca</strong> (las verá el personal): {selectedVenue.accessNotes}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className="label" htmlFor="clientId">Cliente guardado</label>
          <select
            id="clientId"
            name="clientId"
            className="input"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              const chosen = clients.find((x) => x.id === e.target.value);
              if (chosen) setClientName(chosen.name);
            }}
          >
            <option value="">— Otro / ninguno —</option>
            {clients.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          <label className="label" htmlFor="client">Cliente (opcional)</label>
          <input id="client" name="client" className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          {!clientId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="saveClient" value="1" className="size-4" /> Guardar como cliente
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-stone-200 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Comercial y presupuesto</legend>
        <div>
          <label className="label" htmlFor="salesRep">Comercial</label>
          <input id="salesRep" name="salesRep" list="sales-reps" className="input" defaultValue={v.salesRep ?? ""} placeholder="Quién lleva el evento" />
          <datalist id="sales-reps">
            {salesReps.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="budget">Presupuesto de personal (€)</label>
          <input id="budget" name="budget" inputMode="decimal" className="input" defaultValue={v.budget != null ? String(v.budget).replace(".", ",") : ""} placeholder="Automático" />
        </div>
        <div>
          <label className="label" htmlFor="budgetNote">Comentario</label>
          <input id="budgetNote" name="budgetNote" className="input" defaultValue={v.budgetNote ?? ""} placeholder="p. ej. incluye la descarga" />
        </div>
        <p className="text-xs text-stone-500 sm:col-span-3">
          Si dejas el presupuesto vacío se calcula con el personal necesario, las tarifas y el horario (de la citación al fin, con el mínimo de horas).
          Al cerrar el evento se compara con lo fichado.
        </p>
      </fieldset>

      <fieldset className="rounded-lg border border-stone-200 p-4">
        <legend className="px-1 text-sm font-semibold">Ubicación para el fichaje</legend>
        <p className="mb-2 text-xs text-stone-500">
          El personal solo puede fichar a menos de {radius} m de este punto, desde 30 min antes de su citación hasta 30 min después de la hora de fin.
        </p>
        <LocationPicker key={pickerKey} initial={point} radius={radius} />
      </fieldset>

      <fieldset className="rounded-lg border border-stone-200 p-4">
        <legend className="px-1 text-sm font-semibold">Personal necesario</legend>
        <div className="grid gap-4 sm:grid-cols-5">
          <div>
            <label className="label">Camareros</label>
            <input name="needCamareros" type="number" min={0} className="input" defaultValue={v.needCamareros ?? 0} />
          </div>
          <div>
            <label className="label">Maîtres</label>
            <input name="needMaitres" type="number" min={0} className="input" defaultValue={v.needMaitres ?? 0} />
          </div>
          <div>
            <label className="label" title="Hace de maître en eventos pequeños">Camareros responsables</label>
            <input name="needResponsables" type="number" min={0} className="input" defaultValue={v.needResponsables ?? 0} />
          </div>
          <div>
            <label className="label">Mozos</label>
            <input name="needMozos" type="number" min={0} className="input" defaultValue={v.needMozos ?? 0} />
          </div>
          <div>
            <label className="label">Hora descarga (mozos)</label>
            <input name="unloadTime" type="time" className="input" defaultValue={v.unloadTime ?? ""} />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoReplace" value="1" defaultChecked={v.autoReplace ?? true} className="size-4" />
          Reposición automática: si alguien rechaza o se retira, convocar solo al siguiente mejor puntuado del mismo puesto
        </label>
        <p className="mt-2 text-xs text-stone-500">Si indicas hora de descarga, los mozos serán citados a esa hora en lugar de a la hora de servicio.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Notas para el personal (menú, horarios…)</label>
          <textarea name="notes" className="input" rows={4} defaultValue={v.notes ?? ""} />
        </div>
        <div>
          <label className="label">Qué llevar a este evento (una cosa por línea)</label>
          <textarea name="checklist" className="input" rows={4} defaultValue={v.checklist ?? ""} placeholder={"Pajarita granate\nChaleco negro"} />
          <p className="mt-1 text-xs text-stone-500">Se suma al uniforme de cada puesto (Ajustes → Uniforme).</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <SubmitButton>{event ? "Guardar cambios" : "Crear evento"}</SubmitButton>
    </ActionForm>
  );
}
