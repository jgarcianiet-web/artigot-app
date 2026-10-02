import Link from "next/link";
import { saveDraft } from "@/app/actions";
import { EventForm } from "@/app/admin/eventos/EventForm";
import { eventFormOptions } from "@/lib/catalog";
import { CLOCK_RADIUS_M } from "@/lib/clockRules";

/** Nuevo evento en borrador desde el cuadrante. */
export default async function NewDraft({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha } = await searchParams;
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined;
  return (
    <div className="space-y-4">
      <Link href={`/admin/cuadrante${date ? `?semana=${date}` : ""}`} className="text-sm text-stone-500 hover:underline">‹ Cuadrante</Link>
      <h1>Nuevo borrador</h1>
      <p className="max-w-3xl text-sm text-stone-500">
        Un borrador solo lo ve RRHH en el cuadrante: no aparece en Eventos ni en la app del personal y no avisa a nadie. Después de guardarlo eliges a la gente; al pulsar
        «Confirmar y convocar» se crea el evento y les llega la convocatoria.
      </p>
      <EventForm {...await eventFormOptions()} radius={CLOCK_RADIUS_M} defaultDate={date} draft={{ action: saveDraft }} />
    </div>
  );
}
