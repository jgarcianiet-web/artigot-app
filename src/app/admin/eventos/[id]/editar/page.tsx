import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EventForm } from "../../EventForm";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const event = await db.event.findUnique({ where: { id: (await params).id } });
  if (!event) notFound();
  return (
    <div className="space-y-4">
      <h1>Editar evento</h1>
      <EventForm event={event} />
    </div>
  );
}
