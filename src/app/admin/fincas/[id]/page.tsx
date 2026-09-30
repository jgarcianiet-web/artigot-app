import { notFound } from "next/navigation";
import { CLOCK_RADIUS_M } from "@/lib/clockRules";
import { db } from "@/lib/db";
import { VenueForm } from "../VenueForm";

export default async function EditVenue({ params }: { params: Promise<{ id: string }> }) {
  const venue = await db.venue.findUnique({ where: { id: (await params).id } });
  if (!venue) notFound();
  return (
    <div className="space-y-4">
      <h1>{venue.name}</h1>
      <VenueForm venue={venue} radius={CLOCK_RADIUS_M} />
    </div>
  );
}
