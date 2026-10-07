import { callTime, EVENT_TYPE_LABEL, formatDate, isLeadRole, ROLE_LABEL, type Role } from "@/lib/domain";
import { groupLead, type GroupWithLead } from "@/lib/groups";

type Props = {
  role: string;
  event: {
    name: string;
    type: string;
    date: string;
    startTime: string;
    endTime: string | null;
    unloadTime: string | null;
    venue: string;
    lat?: number | null;
    lng?: number | null;
    savedVenue?: { accessNotes: string | null } | null;
    notes: string | null;
  };
  /** Grupo del trabajador en los eventos grandes */
  group?: GroupWithLead | null;
};

/** Datos del servicio tal y como los ve el trabajador. */
export function EventInfo({ event, role, group }: Props) {
  const lead = group ? groupLead(group) : null;
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium tracking-wide text-stone-500 uppercase">
        {EVENT_TYPE_LABEL[event.type]} · {ROLE_LABEL[role as Role]}
      </div>
      <div className="font-semibold">{event.name}</div>
      <div className="text-sm first-letter:uppercase">{formatDate(event.date, { long: true })}</div>
      <div className="text-sm">
        Citación: <strong>{callTime(event, role, group)}</strong>
        {event.endTime && <span className="text-stone-500"> · fin aprox. {event.endTime}</span>}
      </div>
      {group && (
        <div className="my-1 rounded-lg bg-brand-50 px-2 py-1 text-sm">
          <strong>{group.name}</strong>
          {isLeadRole(role) ? " · diriges este grupo" : lead ? ` · ${lead.label}: ${lead.name}` : " · maître por confirmar"}
        </div>
      )}
      <a
        className="text-sm text-brand-700 underline"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          event.lat != null && event.lng != null ? `${event.lat},${event.lng}` : event.venue,
        )}`}
        target="_blank"
      >
        {event.venue}
      </a>
      {event.savedVenue?.accessNotes && (
        <p className="pt-1 text-sm whitespace-pre-line text-stone-600">
          <strong>Cómo llegar:</strong> {event.savedVenue.accessNotes}
        </p>
      )}
      {event.notes && <p className="pt-1 text-sm whitespace-pre-line text-stone-600">{event.notes}</p>}
    </div>
  );
}
