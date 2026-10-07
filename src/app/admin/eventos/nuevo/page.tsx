import Link from "next/link";
import { eventFormOptions } from "@/lib/catalog";
import { CLOCK_RADIUS_M } from "@/lib/clockRules";
import { db } from "@/lib/db";
import { EventForm } from "../EventForm";

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ fecha?: string; plantilla?: string }> }) {
  const { fecha, plantilla } = await searchParams;
  const [options, templates] = await Promise.all([
    eventFormOptions(),
    db.eventTemplate.findMany({ include: { venue: true }, orderBy: { name: "asc" } }),
  ]);
  const t = templates.find((x) => x.id === plantilla);
  const defaults = t
    ? {
        type: t.type,
        startTime: t.startTime,
        endTime: t.endTime,
        unloadTime: t.unloadTime,
        needCamareros: t.needCamareros,
        needResponsables: t.needResponsables,
        needMaitres: t.needMaitres,
        needMozos: t.needMozos,
        notes: t.notes,
        checklist: t.checklist,
        venueId: t.venueId,
        venue: t.venue?.name ?? "",
        lat: t.venue?.lat ?? null,
        lng: t.venue?.lng ?? null,
      }
    : undefined;
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined;

  return (
    <div className="space-y-4">
      <h1>Nuevo evento</h1>
      {templates.length > 0 && (
        <form className="card flex max-w-3xl flex-wrap items-end gap-2">
          {date && <input type="hidden" name="fecha" value={date} />}
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="plantilla">Empezar desde una plantilla</label>
            <select id="plantilla" name="plantilla" className="input" defaultValue={plantilla ?? ""}>
              <option value="">— Evento en blanco —</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </div>
          <button className="btn">Usar</button>
          <Link href="/admin/plantillas" className="text-sm text-stone-500 hover:underline">Gestionar plantillas</Link>
        </form>
      )}
      <EventForm key={plantilla ?? "blank"} defaults={defaults} {...options} radius={CLOCK_RADIUS_M} defaultDate={date} templateId={t?.id} />
    </div>
  );
}
