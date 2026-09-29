import Link from "next/link";
import { notFound } from "next/navigation";
import {
  autoFill,
  deleteEvent,
  duplicateEvent,
  inviteWorkers,
  removeAssignment,
  saveTimesheet,
  setAssignmentStatus,
  setEventStatus,
} from "@/app/actions";
import { ConfirmButton, SelectAll, SubmitButton } from "@/components/client";
import { CoverageBar, Stars, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { unreadCounts } from "@/lib/chat";
import { CLOCK_RADIUS_M, clockWindow, hhmm } from "@/lib/clockRules";
import { db } from "@/lib/db";
import {
  callTime,
  euro,
  EVENT_TYPE_LABEL,
  formatDate,
  num,
  payable,
  ROLE_LABEL,
  ROLE_PLURAL,
  ROLES,
  workedHours,
} from "@/lib/domain";
import { candidatesFor, coverage, gaps } from "@/lib/staffing";

function ClockTag({ distance, accuracy, manual }: { distance: number | null; accuracy: number | null; manual: boolean }) {
  if (manual) return <div className="text-[11px] text-stone-500">✎ manual</div>;
  if (distance == null) return null;
  return (
    <div className="text-[11px] text-emerald-700" title={`Precisión del GPS: ±${accuracy ?? "?"} m`}>
      📍 {distance} m
    </div>
  );
}

const STATUS_ORDER: Record<string, number> = { CONFIRMADO: 0, CONVOCADO: 1, RECHAZADO: 2, CANCELADO: 3 };

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const adminName = await requireAdmin();
  const event = await db.event.findUnique({
    where: { id: (await params).id },
    include: { assignments: { include: { worker: true }, orderBy: { worker: { name: "asc" } } } },
  });
  if (!event) notFound();

  const [candidates, rates, unread, messageCount] = await Promise.all([
    candidatesFor(event),
    db.rate.findMany(),
    unreadCounts({ kind: "admin", name: adminName }, [event.id]),
    db.message.count({ where: { eventId: event.id } }),
  ]);
  const unreadChat = unread.get(event.id) ?? 0;
  const rateByRole = new Map(rates.map((r) => [r.role, r]));
  const cov = coverage(event, event.assignments);
  const missing = gaps(event, event.assignments);
  const totalMissing = ROLES.reduce((s, r) => s + missing[r], 0);
  const fillable = ROLES.reduce((s, r) => s + Math.min(missing[r], candidates[r].length), 0);
  const confirmed = event.assignments.filter((a) => a.status === "CONFIRMADO");


  let totalHours = 0;
  let totalCost = 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium tracking-wide text-stone-500 uppercase">
            {EVENT_TYPE_LABEL[event.type]} {event.status === "CERRADO" && "· Cerrado"}
          </div>
          <h1>{event.name}</h1>
          <p className="text-sm text-stone-600">
            <span className="inline-block first-letter:uppercase">{formatDate(event.date, { long: true })}</span> · Servicio {event.startTime}
            {event.endTime && `–${event.endTime}`}
            {event.unloadTime && ` · Descarga ${event.unloadTime}`}
          </p>
          <p className="text-sm text-stone-600">
            {event.venue}
            {event.client && ` · Cliente: ${event.client}`}
          </p>
          {event.lat == null && (
            <p className="mt-1 text-sm font-medium text-amber-700">
              ⚠ Sin ubicación: el personal no podrá fichar.{" "}
              <Link href={`/admin/eventos/${event.id}/editar`} className="underline">Fijar en el mapa</Link>
            </p>
          )}
          {event.notes && <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-stone-600">{event.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/eventos/${event.id}/chat`} className="btn btn-primary">
            💬 Chat del evento
            {unreadChat > 0 && <span className="rounded-full bg-white px-1.5 text-xs text-brand-700">{unreadChat}</span>}
            {unreadChat === 0 && messageCount > 0 && <span className="text-xs opacity-80">({messageCount})</span>}
          </Link>
          <Link href={`/admin/eventos/${event.id}/editar`} className="btn">Editar</Link>
          <form action={duplicateEvent.bind(null, event.id)}>
            <SubmitButton className="btn">Duplicar</SubmitButton>
          </form>
          <form action={setEventStatus.bind(null, event.id, event.status === "CERRADO" ? "ABIERTO" : "CERRADO")}>
            <SubmitButton className="btn">{event.status === "CERRADO" ? "Reabrir" : "Cerrar evento"}</SubmitButton>
          </form>
          <form action={deleteEvent.bind(null, event.id)}>
            <ConfirmButton message="¿Eliminar este evento y todas sus convocatorias?">Eliminar</ConfirmButton>
          </form>
        </div>
      </div>

      {/* Cobertura */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>Cobertura</h2>
          {totalMissing > 0 && (
            <form action={autoFill.bind(null, event.id)} className="flex items-center gap-2">
              <span className="text-sm text-stone-500">
                Faltan {totalMissing} · {fillable} candidatos disponibles
              </span>
              <SubmitButton className="btn btn-primary" >Autocompletar convocatoria</SubmitButton>
            </form>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {cov.map((c) => (
            <div key={c.role} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{ROLE_PLURAL[c.role]}</span>
                <span>
                  <span className="text-emerald-700">{c.confirmed}</span>
                  {c.pending > 0 && <span className="text-amber-600"> + {c.pending} pend.</span>} / {c.need}
                </span>
              </div>
              <CoverageBar {...c} />
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          «Autocompletar» convoca a los mejor valorados que estén libres ese día, priorizando a quien menos ha trabajado en los últimos 30 días. Cada convocado recibe un aviso en el móvil para aceptar o rechazar; al aceptar entra en el chat del evento.
        </p>
      </section>

      {/* Por puesto */}
      {ROLES.filter((role) => cov.find((c) => c.role === role)!.need > 0 || event.assignments.some((a) => a.role === role)).map((role) => {
        const assigned = event.assignments
          .filter((a) => a.role === role)
          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
        const free = candidates[role];
        return (
          <section key={role} className="grid gap-4 lg:grid-cols-2">
            <div className="card space-y-2">
              <h2>
                {ROLE_PLURAL[role]} convocados <span className="text-sm font-normal text-stone-500">· citación {callTime(event, role)}</span>
              </h2>
              {assigned.length === 0 && <p className="text-sm text-stone-500">Nadie convocado todavía.</p>}
              <ul className="divide-y divide-stone-100">
                {assigned.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link href={`/admin/personal/${a.workerId}`} className="link mr-auto">{a.worker.name}</Link>
                    <StatusBadge status={a.status} />
                    {a.status !== "CONFIRMADO" && (
                      <form action={setAssignmentStatus.bind(null, a.id, "CONFIRMADO")}>
                        <button className="btn btn-sm" title="Marcar como confirmado (p. ej. confirmó por teléfono)">✓</button>
                      </form>
                    )}
                    {a.status === "CONFIRMADO" && (
                      <form action={setAssignmentStatus.bind(null, a.id, "CANCELADO")}>
                        <button className="btn btn-sm" title="Cancelar su participación">Cancelar</button>
                      </form>
                    )}
                    {(a.status === "RECHAZADO" || a.status === "CANCELADO") && (
                      <form action={setAssignmentStatus.bind(null, a.id, "CONVOCADO")}>
                        <button className="btn btn-sm" title="Volver a convocar">↺</button>
                      </form>
                    )}
                    <form action={removeAssignment.bind(null, a.id)}>
                      <button className="btn btn-sm btn-danger" title="Quitar de la lista">✕</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>

            <form action={inviteWorkers.bind(null, event.id)} className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2>
                  {ROLE_PLURAL[role]} disponibles <span className="text-sm font-normal text-stone-500">({free.length})</span>
                </h2>
                {free.length > 0 && <SubmitButton className="btn btn-sm btn-primary">Convocar seleccionados</SubmitButton>}
              </div>
              {free.length === 0 ? (
                <p className="text-sm text-stone-500">No quedan {ROLE_PLURAL[role].toLowerCase()} libres ese día.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="w-8"><SelectAll name="workerId" /></th>
                        <th>Nombre</th>
                        <th>Valoración</th>
                        <th className="text-right" title="Servicios en los últimos 30 días">30 d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {free.map((c, i) => (
                        <tr key={c.id}>
                          <td>
                            <input
                              type="checkbox"
                              name="workerId"
                              value={c.id}
                              className="size-4"
                              defaultChecked={i < missing[role]}
                            />
                          </td>
                          <td>
                            {c.name}
                            {c.zone && <div className="text-xs text-stone-500">{c.zone}</div>}
                          </td>
                          <td><Stars value={c.rating} /></td>
                          <td className="text-right">{c.recentEvents}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </form>
          </section>
        );
      })}

      {/* Fichaje */}
      {confirmed.length > 0 && (
        <form action={saveTimesheet.bind(null, event.id)} className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2>Fichaje y horas</h2>
            <SubmitButton>Guardar horas</SubmitButton>
          </div>
          <p className="text-xs text-stone-500">
            El personal ficha desde la app con su ubicación (a menos de {CLOCK_RADIUS_M} m, de {hhmm(clockWindow(event, "CAMARERO").opensAt)} a{" "}
            {hhmm(clockWindow(event, "CAMARERO").closesAt)}; los mozos desde {hhmm(clockWindow(event, "MOZO").opensAt)}). 📍 = distancia
            al evento al fichar. ✎ = hora corregida por RRHH. Las horas manuales tienen prioridad.
          </p>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Puesto</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Horas manuales</th>
                  <th className="text-right">Horas</th>
                  <th className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map((a) => {
                  const h = workedHours(a);
                  const { billedHours, amount } = payable(h, rateByRole.get(a.role));
                  totalHours += billedHours ?? 0;
                  totalCost += amount;
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{a.worker.name}</td>
                      <td>{ROLE_LABEL[a.role as keyof typeof ROLE_LABEL]}</td>
                      <td>
                        <input type="time" name={`in_${a.id}`} defaultValue={a.checkIn ?? ""} className="input w-28" />
                        <ClockTag distance={a.checkInDistance} accuracy={a.checkInAccuracy} manual={a.checkInManual} />
                      </td>
                      <td>
                        <input type="time" name={`out_${a.id}`} defaultValue={a.checkOut ?? ""} className="input w-28" />
                        <ClockTag distance={a.checkOutDistance} accuracy={a.checkOutAccuracy} manual={a.checkOutManual} />
                      </td>
                      <td>
                        <input
                          name={`hours_${a.id}`}
                          inputMode="decimal"
                          defaultValue={a.hoursOverride ?? ""}
                          placeholder="—"
                          className="input w-20"
                        />
                      </td>
                      <td className="text-right">{billedHours != null ? num(billedHours) : <span className="text-stone-400">sin fichar</span>}</td>
                      <td className="text-right">{billedHours != null ? euro(amount) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={5}>Total</td>
                  <td className="px-3 py-2 text-right">{num(totalHours)}</td>
                  <td className="px-3 py-2 text-right">{euro(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </form>
      )}
    </div>
  );
}
