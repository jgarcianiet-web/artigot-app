import { CLOCK_RADIUS_M } from "@/lib/clockRules";
import { EventForm } from "../EventForm";

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha } = await searchParams;
  return (
    <div className="space-y-4">
      <h1>Nuevo evento</h1>
      <EventForm radius={CLOCK_RADIUS_M} defaultDate={fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined} />
    </div>
  );
}
