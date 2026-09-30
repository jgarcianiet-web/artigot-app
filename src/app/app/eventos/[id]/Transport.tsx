import { db } from "@/lib/db";
import { eventTransport, MAX_SEATS, TRANSPORT } from "@/lib/transport";
import { joinRide, leaveRide, setMyTransport } from "../../actions";

/** Tarjeta «Cómo vas» del evento en la app: modo de transporte, coches con plazas y pasajeros. */
export async function Transport({ assignmentId, eventId, meetingPoint, meetingTime, editable }: {
  assignmentId: string;
  eventId: string;
  meetingPoint: string | null;
  meetingTime: string | null;
  editable: boolean;
}) {
  const [t, me] = await Promise.all([
    eventTransport(eventId),
    db.assignment.findUniqueOrThrow({ where: { id: assignmentId }, select: { transport: true, seats: true, worker: { select: { carSeats: true } } } }),
  ]);
  const myCar = t.cars.find((c) => c.driver.id === assignmentId);
  const riding = t.carOf(assignmentId);
  const open = t.cars.filter((c) => c.driver.id !== assignmentId && c.free > 0);
  const summary = me.transport === "CONDUZCO" ? `Llevas coche (${myCar?.passengers.length ?? 0}/${me.seats ?? 0} plazas ocupadas)`
    : me.transport === "NECESITO" ? (riding ? `Vas con ${riding.driver.worker.name}` : "Buscas coche")
    : me.transport === "PROPIO" ? "Vas por tu cuenta" : "Indica cómo vas";

  return (
    <details className="card" open={!me.transport || (me.transport === "NECESITO" && !riding)}>
      <summary className="cursor-pointer list-none space-y-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span className="whitespace-nowrap font-semibold">🚗 Cómo vas</span>
          <span className={`text-right text-sm ${me.transport ? "text-stone-600" : "font-medium text-amber-700"}`}>{summary} ▾</span>
        </span>
        {(meetingPoint || meetingTime) && (
          <span className="block rounded-lg bg-stone-100 p-2 text-sm">📍 Punto de encuentro: <b>{meetingPoint ?? "—"}</b>{meetingTime && <> a las <b>{meetingTime}</b></>}</span>
        )}
      </summary>
      <div className="mt-3 space-y-3 text-sm">

        {editable && (
          <form action={setMyTransport.bind(null, assignmentId)} className="space-y-2">
            {(Object.keys(TRANSPORT) as (keyof typeof TRANSPORT)[]).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name="transport" value={k} defaultChecked={me.transport === k} required className="size-4" />
                {TRANSPORT[k]}
                {k === "CONDUZCO" && (
                  <span className="flex items-center gap-1 text-stone-600">
                    · plazas libres
                    <input name="seats" type="number" min={0} max={MAX_SEATS} defaultValue={me.seats ?? me.worker.carSeats ?? 3} className="input w-16 py-1" aria-label="Plazas libres" />
                  </span>
                )}
              </label>
            ))}
            <button className="btn btn-sm">Guardar</button>
          </form>
        )}

        {myCar && (
          <div>
            <p className="font-medium">Tus pasajeros ({myCar.passengers.length}/{myCar.seats})</p>
            {myCar.passengers.length === 0 ? <p className="text-stone-500">Aún nadie.</p> : (
              <ul className="divide-y">
                {myCar.passengers.map((p) => (
                  <li key={p.id} className="flex justify-between py-1.5"><span>{p.worker.name}{p.worker.zone && <span className="text-stone-400"> · {p.worker.zone}</span>}</span><a href={`tel:${p.worker.phone}`} className="link">{p.worker.phone}</a></li>
                ))}
              </ul>
            )}
          </div>
        )}

        {me.transport === "NECESITO" && riding && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2">
            <span>Vas en el coche de <b>{riding.driver.worker.name}</b> · <a href={`tel:${riding.driver.worker.phone}`} className="link">{riding.driver.worker.phone}</a></span>
            {editable && <form action={leaveRide.bind(null, assignmentId)}><button className="text-xs text-red-700 underline">Salir</button></form>}
          </div>
        )}

        {me.transport === "NECESITO" && !riding && (
          open.length === 0 ? (
            <p className="text-stone-600">De momento nadie tiene plazas libres. RRHH te asignará un coche.</p>
          ) : (
            <div>
              <p className="font-medium">Coches con plazas libres</p>
              <ul className="divide-y">
                {open.map((c) => (
                  <li key={c.driver.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{c.driver.worker.name}{c.driver.worker.zone && <span className="text-stone-400"> · {c.driver.worker.zone}</span>} <span className="text-stone-500">({c.free} {c.free === 1 ? "plaza" : "plazas"})</span></span>
                    {editable && <form action={joinRide.bind(null, assignmentId, c.driver.id)}><button className="btn btn-sm">Ir con {c.driver.worker.name.split(" ")[0]}</button></form>}
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
      </div>
    </details>
  );
}
