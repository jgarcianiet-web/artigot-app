import { callTime, EVENT_TYPE_LABEL, formatDate, ROLE_LABEL, type Role } from "@/lib/domain";

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
    notes: string | null;
  };
};

/** Datos del servicio tal y como los ve el trabajador. */
export function EventInfo({ event, role }: Props) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium tracking-wide text-stone-500 uppercase">
        {EVENT_TYPE_LABEL[event.type]} · {ROLE_LABEL[role as Role]}
      </div>
      <div className="font-semibold">{event.name}</div>
      <div className="text-sm first-letter:uppercase">{formatDate(event.date, { long: true })}</div>
      <div className="text-sm">
        Citación: <strong>{callTime(event, role)}</strong>
        {event.endTime && <span className="text-stone-500"> · fin aprox. {event.endTime}</span>}
      </div>
      <a
        className="text-sm text-brand-700 underline"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue)}`}
        target="_blank"
      >
        {event.venue}
      </a>
      {event.notes && <p className="pt-1 text-sm whitespace-pre-line text-stone-600">{event.notes}</p>}
    </div>
  );
}
