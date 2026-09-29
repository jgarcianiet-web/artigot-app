import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { addDays, callTime, EVENT_TYPE_LABEL, formatDate, num, ROLE_LABEL, today, workedHours, type Role } from "@/lib/domain";
import { clock, respond, toggleUnavailable } from "./actions";

export const metadata: Metadata = { title: "Mis servicios", robots: { index: false, follow: false } };

const DAYS_AHEAD = 56;

export default async function WorkerPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = today();
  const worker = await db.worker.findUnique({
    where: { token },
    include: {
      assignments: {
        where: { event: { date: { gte: addDays(t, -60) } } },
        include: { event: true },
        orderBy: { event: { date: "asc" } },
      },
      unavailabilities: { where: { date: { gte: t, lte: addDays(t, DAYS_AHEAD) } } },
    },
  });
  if (!worker || !worker.active) notFound();

  const yesterday = addDays(t, -1);
  const clockable = worker.assignments.filter(
    (a) =>
      a.status === "CONFIRMADO" &&
      (a.event.date === t || (a.event.date === yesterday && a.checkIn && !a.checkOut)),
  );
  const pending = worker.assignments.filter((a) => a.status === "CONVOCADO" && a.event.date >= t);
  const upcoming = worker.assignments.filter((a) => a.status === "CONFIRMADO" && a.event.date >= t && !clockable.includes(a));
  const history = worker.assignments
    .filter((a) => a.status === "CONFIRMADO" && a.event.date < t && !clockable.includes(a))
    .reverse()
    .slice(0, 10);

  const unavailable = new Set(worker.unavailabilities.map((u) => u.date));
  const busy = new Set(
    worker.assignments.filter((a) => ["CONVOCADO", "CONFIRMADO"].includes(a.status)).map((a) => a.event.date),
  );
  const firstDay = new Date(`${t}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const offset = (firstDay + 6) % 7; // semana empieza en lunes
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(t, i));

  const EventInfo = ({ a }: { a: (typeof worker.assignments)[number] }) => (
    <div className="space-y-0.5">
      <div className="text-xs font-medium tracking-wide text-stone-500 uppercase">
        {EVENT_TYPE_LABEL[a.event.type]} · {ROLE_LABEL[a.role as Role]}
      </div>
      <div className="font-semibold">{a.event.name}</div>
      <div className="text-sm first-letter:uppercase">{formatDate(a.event.date, { long: true })}</div>
      <div className="text-sm">
        Citación: <strong>{callTime(a.event, a.role)}</strong>
        {a.event.endTime && <span className="text-stone-500"> · fin aprox. {a.event.endTime}</span>}
      </div>
      <a
        className="text-sm text-brand-700 underline"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.event.venue)}`}
        target="_blank"
      >
        {a.event.venue}
      </a>
      {a.event.notes && <p className="pt-1 text-sm whitespace-pre-line text-stone-600">{a.event.notes}</p>}
    </div>
  );

  return (
    <main className="mx-auto max-w-lg space-y-6 p-4 pb-16">
      <header>
        <p className="text-sm text-stone-500">Artigot · {ROLE_LABEL[worker.role as Role]}</p>
        <h1>Hola, {worker.name.split(" ")[0]}</h1>
      </header>

      {clockable.map((a) => (
        <section key={a.id} className="card space-y-3 border-brand-600 ring-2 ring-brand-100">
          <h2>Hoy trabajas</h2>
          <EventInfo a={a} />
          <div className="grid grid-cols-2 gap-2">
            <form action={clock.bind(null, token, a.id, "in")}>
              <button className="btn btn-success w-full py-4 text-base" disabled={!!a.checkIn || a.event.date !== t}>
                {a.checkIn ? `Entrada ${a.checkIn}` : "Fichar entrada"}
              </button>
            </form>
            <form action={clock.bind(null, token, a.id, "out")}>
              <button className="btn btn-primary w-full py-4 text-base" disabled={!a.checkIn || !!a.checkOut}>
                {a.checkOut ? `Salida ${a.checkOut}` : "Fichar salida"}
              </button>
            </form>
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <h2>Convocatorias pendientes {pending.length > 0 && <span className="text-amber-600">({pending.length})</span>}</h2>
        {pending.length === 0 && <p className="text-sm text-stone-500">No tienes convocatorias pendientes de responder.</p>}
        {pending.map((a) => (
          <div key={a.id} className="card space-y-3 border-amber-300">
            <EventInfo a={a} />
            <div className="grid grid-cols-2 gap-2">
              <form action={respond.bind(null, token, a.id, true)}>
                <button className="btn btn-success w-full py-3">Acepto</button>
              </form>
              <form action={respond.bind(null, token, a.id, false)}>
                <button className="btn btn-danger w-full py-3">No puedo</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2>Próximos servicios confirmados</h2>
        {upcoming.length === 0 && <p className="text-sm text-stone-500">Ninguno por ahora.</p>}
        {upcoming.map((a) => (
          <details key={a.id} className="card">
            <summary className="flex cursor-pointer items-center justify-between gap-2">
              <span>
                <span className="font-medium">{a.event.name}</span>
                <span className="block text-sm text-stone-500">
                  {formatDate(a.event.date)} · {callTime(a.event, a.role)}
                </span>
              </span>
              <StatusBadge status={a.status} />
            </summary>
            <div className="mt-3 space-y-3">
              <EventInfo a={a} />
              <form action={respond.bind(null, token, a.id, false)}>
                <button className="btn btn-danger btn-sm">Ya no puedo ir</button>
              </form>
            </div>
          </details>
        ))}
      </section>

      <section className="space-y-3">
        <h2>Mi disponibilidad</h2>
        <p className="text-sm text-stone-500">Toca un día para marcarlo como <strong className="text-red-600">no disponible</strong> (o para quitarlo).</p>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <div key={d} className="font-medium text-stone-500">{d}</div>
          ))}
          {Array.from({ length: offset }, (_, i) => <div key={`o${i}`} />)}
          {days.map((d) => {
            const off = unavailable.has(d);
            const work = busy.has(d);
            const day = Number(d.slice(8));
            return (
              <form key={d} action={toggleUnavailable.bind(null, token, d)}>
                <button
                  className={`aspect-square w-full rounded-md border text-sm ${
                    off
                      ? "border-red-300 bg-red-100 text-red-700 line-through"
                      : work
                        ? "border-emerald-300 bg-emerald-100 font-semibold text-emerald-800"
                        : "border-stone-200 bg-white"
                  }`}
                  title={d}
                >
                  {day === 1 || d === t ? (
                    <span className="block leading-tight">
                      {day}
                      <span className="block text-[9px] uppercase">{formatDate(d).split(" ").pop()}</span>
                    </span>
                  ) : (
                    day
                  )}
                </button>
              </form>
            );
          })}
        </div>
        <div className="flex gap-4 text-xs text-stone-500">
          <span><span className="inline-block size-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Tengo servicio</span>
          <span><span className="inline-block size-3 rounded bg-red-100 ring-1 ring-red-300" /> No disponible</span>
        </div>
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <h2>Últimos servicios</h2>
          <ul className="card divide-y divide-stone-100 p-0 text-sm">
            {history.map((a) => {
              const h = workedHours(a);
              return (
                <li key={a.id} className="flex justify-between px-4 py-2">
                  <span>
                    {a.event.name} <span className="text-stone-500">· {formatDate(a.event.date)}</span>
                  </span>
                  <span>{h != null ? `${num(h)} h` : "—"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
