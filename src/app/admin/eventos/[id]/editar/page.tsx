import { notFound } from "next/navigation";
import { eventFormOptions } from "@/lib/catalog";
import { CLOCK_RADIUS_M } from "@/lib/clockRules";
import { db } from "@/lib/db";
import { EventForm } from "../../EventForm";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const [event, options] = await Promise.all([db.event.findUnique({ where: { id: (await params).id } }), eventFormOptions()]);
  if (!event) notFound();
  return (
    <div className="space-y-4">
      <h1>Editar evento</h1>
      <EventForm event={event} {...options} radius={CLOCK_RADIUS_M} />
    </div>
  );
}
