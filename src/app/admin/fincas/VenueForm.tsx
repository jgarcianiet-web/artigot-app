"use client";

import { useActionState } from "react";
import { saveVenue } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import { LocationPicker } from "@/components/LocationPicker";

type Venue = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  accessNotes: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

export function VenueForm({ venue, radius }: { venue?: Venue; radius: number }) {
  const [error, action] = useActionState(saveVenue, null);
  return (
    <ActionForm action={action} className="card max-w-3xl space-y-4">
      {venue && <input type="hidden" name="id" value={venue.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Nombre</label>
          <input name="name" className="input" defaultValue={venue?.name} required placeholder="Finca El Olivar" />
        </div>
        <div>
          <label className="label">Dirección</label>
          <input name="address" className="input" defaultValue={venue?.address ?? ""} />
        </div>
        <div>
          <label className="label">Persona de contacto</label>
          <input name="contactName" className="input" defaultValue={venue?.contactName ?? ""} />
        </div>
        <div>
          <label className="label">Teléfono de contacto</label>
          <input name="contactPhone" type="tel" className="input" defaultValue={venue?.contactPhone ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Indicaciones de acceso para el personal</label>
          <textarea
            name="accessNotes"
            rows={3}
            className="input"
            defaultValue={venue?.accessNotes ?? ""}
            placeholder="Entrada de personal por el camino de la izquierda; parking junto a las cocinas; vestuario en el almacén…"
          />
          <p className="mt-1 text-xs text-stone-500">Aparecen en la app del personal en todos los eventos de esta finca.</p>
        </div>
      </div>
      <fieldset className="rounded-lg border border-stone-200 p-4">
        <legend className="px-1 text-sm font-semibold">Punto para el fichaje</legend>
        <LocationPicker initial={venue?.lat != null && venue?.lng != null ? { lat: venue.lat, lng: venue.lng } : null} radius={radius} venueInputName="address" />
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <SubmitButton>{venue ? "Guardar cambios" : "Crear finca"}</SubmitButton>
    </ActionForm>
  );
}
