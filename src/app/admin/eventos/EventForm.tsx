"use client";

import { useActionState, useState } from "react";
import { saveEvent } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import { LocationPicker } from "@/components/LocationPicker";
import { staffForGuests, type AutomationSettings } from "@/lib/automation";
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
  guests: number | null;
  autoConvokeDays: number | null;
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
  draft,
  templateId,
  automation,
}: {
  event?: Event;
  /** Valores iniciales de un evento nuevo (p. ej. desde una plantilla) */
  defaults?: Partial<Event>;
  venues: VenueOption[];
  clients: ClientOption[];
  salesReps?: string[];
  radius: number;
  defaultDate?: string;
  /** Borrador del cuadrante: se guarda sin crear el evento ni avisar a nadie */
  draft?: { id?: string; action: (prev: string | null, form: FormData) => Promise<string | null> };
  /** Plantilla de la que sale el evento nuevo (para crear también sus grupos) */
  templateId?: string;
  /** Proporciones por invitados y convocatoria automática (Ajustes → Automatizaciones) */
  automation: Pick<AutomationSettings, "ratios" | "convoke">;
}) {
  const [error, action] = useActionState(draft?.action ?? saveEvent, null);
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
  // Personal necesario: se puede escribir a mano o se calcula con los invitados y el tipo de evento
  const [type, setType] = useState(v.type ?? "BODA");
  const [guests, setGuests] = useState(v.guests != null ? String(v.guests) : "");
  const [need, setNeed] = useState({ needCamareros: v.needCamareros ?? 0, needMaitres: v.needMaitres ?? 0, needResponsables: v.needResponsables ?? 0, needMozos: v.needMozos ?? 0 });
  const recalc = (g: string, t: string) => {
    const s = staffForGuests(Number(g), automation.ratios[t]);
    if (Number(g) > 0) setNeed((n) => ({ ...n, needCamareros: s.CAMARERO ?? 0, needMaitres: s.MAITRE ?? 0, needMozos: s.MOZO ?? 0 }));
  };
  const ratio = automation.ratios[type];
  const isNew = !event;
  const [autoOn, setAutoOn] = useState(isNew ? automation.convoke.defaultOn : v.autoConvokeDays != null);

  return (
    <ActionForm action={action} className="card max-w-3xl space-y-5" noValidate={!!draft}>
      {event && !draft && <input type="hidden" name="id" value={event.id} />}
      {draft?.id && <input type="hidden" name="draftId" value={draft.id} />}
      {templateId && !event && <input type="hidden" name="plantilla" value={templateId} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label">Nombre del evento</label>
          <input name="name" className="input" defaultValue={v.name} required placeholder="Boda Laura y Pablo" />
        </div>
        <div>
          <label className="label">Tipo</label>
          <select
            name="type"
            className="input"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              recalc(guests, e.target.value);
            }}
          >
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
          El personal solo puede fichar a menos de {radius} m de este punto. Si ficha más de 30 min antes de su citación o más de 30 min después de la hora de fin, tiene que escribir el motivo.
        </p>
        <LocationPicker key={pickerKey} initial={point} radius={radius} />
      </fieldset>

      <fieldset className="rounded-lg border border-stone-200 p-4">
        <legend className="px-1 text-sm font-semibold">Personal necesario</legend>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex w-36 flex-col gap-1">
            <span className="label mb-0">Invitados</span>
            <input
              name="guests"
              type="number"
              min={1}
              max={5000}
              inputMode="numeric"
              className="input h-10"
              value={guests}
              onChange={(e) => {
                setGuests(e.target.value);
                recalc(e.target.value, type);
              }}
              placeholder="p. ej. 180"
            />
          </label>
          <p className="min-w-60 flex-1 pb-2 text-xs text-stone-500">
            Al poner los invitados se calcula el personal ({EVENT_TYPE_LABEL[type] ?? type}:{" "}
            {[
              ratio.camareros > 0 && `1 camarero cada ${ratio.camareros}`,
              (ratio.maitres > 0 || ratio.minMaitres > 0) && `1 maître cada ${ratio.maitres || "—"}${ratio.minMaitres ? ` (mínimo ${ratio.minMaitres})` : ""}`,
              ratio.mozos > 0 && `1 mozo cada ${ratio.mozos}`,
            ]
              .filter(Boolean)
              .join(", ") || "sin proporciones"}
            ; se cambia en Ajustes → Automatizaciones). Puedes ajustar los números a mano.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {([
            { name: "needCamareros", label: "Camareros" },
            { name: "needMaitres", label: "Maîtres" },
            { name: "needResponsables", label: "Responsables", title: "Camareros responsables: hacen de maître en eventos pequeños" },
            { name: "needMozos", label: "Mozos" },
          ] as const).map((f) => (
            <label key={f.name} className="flex flex-col gap-1" title={"title" in f ? f.title : undefined}>
              <span className="label mb-0 truncate">{f.label}</span>
              <input
                name={f.name}
                type="number"
                min={0}
                inputMode="numeric"
                className="input h-10"
                value={need[f.name]}
                onChange={(e) => setNeed((n) => ({ ...n, [f.name]: e.target.value === "" ? "" : Number(e.target.value) }))}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="label mb-0 truncate">Descarga mozos</span>
            <input name="unloadTime" type="time" className="input h-10" defaultValue={v.unloadTime ?? ""} />
          </label>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          «Responsables» son camareros responsables (hacen de maître en eventos pequeños). Si pones hora de descarga, los mozos se citan a esa hora en vez de a la de servicio.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="autoReplace" value="1" defaultChecked={v.autoReplace ?? true} className="mt-0.5 size-4 shrink-0" />
          <span>Reposición automática: si alguien rechaza o se retira, se convoca solo al siguiente mejor puntuado del mismo puesto.</span>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoConvoke" value="1" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} className="size-4 shrink-0" />
            <span>Convocatoria automática</span>
          </label>
          {autoOn && (
            <>
              <input
                name="autoConvokeDays"
                type="number"
                min={0}
                max={60}
                className="input h-8 w-16 py-0"
                defaultValue={v.autoConvokeDays ?? automation.convoke.days}
                aria-label="Días antes"
              />
              <span>días antes, a partir de las {automation.convoke.hour}: se convoca solo a los mejor puntuados libres hasta cubrir el personal necesario.</span>
            </>
          )}
        </div>
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
      <SubmitButton>{draft ? "Guardar borrador" : event ? "Guardar cambios" : "Crear evento"}</SubmitButton>
    </ActionForm>
  );
}
