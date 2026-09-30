import { CLOCK_RADIUS_M } from "@/lib/clockRules";
import { VenueForm } from "../VenueForm";

export default function NewVenue() {
  return (
    <div className="space-y-4">
      <h1>Nueva finca</h1>
      <VenueForm radius={CLOCK_RADIUS_M} />
    </div>
  );
}
