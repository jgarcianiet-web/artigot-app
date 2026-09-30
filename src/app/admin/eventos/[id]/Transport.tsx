import { SubmitButton } from "@/components/client";
import { eventTransport, MAX_SEATS, TRANSPORT } from "@/lib/transport";
import { askTransport, autoAssignAction, saveMeeting, saveTransportAdmin } from "../transportActions";

export async function AdminTransport({ eventId, meetingPoint, meetingTime }: { eventId: string; meetingPoint: string | null; meetingTime: string | null }) {
  const t = await eventTransport(eventId);
  const freeSeats = t.cars.reduce((n, c) => n + Math.max(0, c.free), 0);
  const carOf = (id: string) => t.carOf(id)?.driver.id ?? "";
  return (
    <details className="card" open={t.needing.length > 0}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <h2>🚗 Transporte</h2>
        <span className="text-sm text-stone-600">
          {t.cars.length} coches · {freeSeats} plazas libres ·{" "}
          <span className={t.needing.length ? "font-medium text-red-700" : ""}>{t.needing.length} sin coche</span> · {t.unanswered.length} sin responder
        </span>
      </summary>
      <div className="mt-3 space-y-4">
        <form action={saveMeeting.bind(null, eventId)} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Punto de encuentro<input name="meetingPoint" defaultValue={meetingPoint ?? ""} className="input mt-1 w-72" placeholder="Gasolinera de la entrada del pueblo" /></label>
          <label className="text-sm">Hora<input name="meetingTime" type="time" defaultValue={meetingTime ?? ""} className="input mt-1 w-32" /></label>
          <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="notify" value="1" defaultChecked /> Avisar al equipo</label>
          <SubmitButton className="btn">Guardar</SubmitButton>
        </form>

        <div className="flex flex-wrap gap-2">
          {t.needing.length > 0 && freeSeats > 0 && (
            <form action={autoAssignAction.bind(null, eventId)}><SubmitButton>Repartir automáticamente ({Math.min(t.needing.length, freeSeats)})</SubmitButton></form>
          )}
          {t.unanswered.length > 0 && (
            <form action={askTransport.bind(null, eventId)}><SubmitButton className="btn">Pedir que respondan ({t.unanswered.length})</SubmitButton></form>
          )}
        </div>

        {t.rows.length > 0 && (
          <form action={saveTransportAdmin.bind(null, eventId)} className="space-y-2">
            <div className="overflow-x-auto">
              <table className="table text-sm">
                <thead><tr><th>Persona</th><th>Zona</th><th>Cómo va</th><th>Plazas</th><th>Coche</th></tr></thead>
                <tbody>
                  {t.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{r.worker.name}</td>
                      <td className="text-stone-500">{r.worker.zone ?? "—"}</td>
                      <td>
                        <select name={`mode_${r.id}`} defaultValue={r.transport ?? ""} className="input py-1" aria-label={`Cómo va ${r.worker.name}`}>
                          <option value="">Sin indicar</option>
                          {(Object.keys(TRANSPORT) as (keyof typeof TRANSPORT)[]).map((k) => <option key={k} value={k}>{TRANSPORT[k]}</option>)}
                        </select>
                      </td>
                      <td>
                        <input name={`seats_${r.id}`} type="number" min={0} max={MAX_SEATS} defaultValue={r.seats ?? ""} className="input w-16 py-1" aria-label={`Plazas de ${r.worker.name}`} />
                      </td>
                      <td>
                        <select name={`ride_${r.id}`} defaultValue={carOf(r.id)} className="input py-1" aria-label={`Coche de ${r.worker.name}`}>
                          <option value="">—</option>
                          {t.cars.filter((c) => c.driver.id !== r.id).map((c) => (
                            <option key={c.driver.id} value={c.driver.id}>{c.driver.worker.name} ({c.passengers.length}/{c.seats})</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SubmitButton className="btn">Guardar transporte</SubmitButton>
            <p className="text-xs text-stone-500">El coche solo se aplica a quien «Necesita que le lleven», y nunca por encima de las plazas del conductor. Cada persona también puede indicarlo desde su app.</p>
          </form>
        )}
      </div>
    </details>
  );
}
