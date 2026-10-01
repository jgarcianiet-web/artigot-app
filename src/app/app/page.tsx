import Link from "next/link";
import { ClockButtons } from "@/components/ClockButtons";
import { PollCard } from "@/components/PollCard";
import { openPollsFor } from "@/lib/polls";
import { EventInfo } from "@/components/EventInfo";
import { requireWorker } from "@/lib/auth";
import { unreadCounts } from "@/lib/chat";
import { CLOCK_RADIUS_M, clockWindow, hhmm } from "@/lib/clockRules";
import { db } from "@/lib/db";
import { pendingReviews } from "@/lib/reviews";
import { addDays, callTime, isLeadRole, formatDate, num, ROLE_LABEL, today, workedHours, type Role } from "@/lib/domain";
import { Checklist } from "@/components/StaffForms";
import { checklistFor, getUniform, lines } from "@/lib/staff";
import { respond, startPrivacySignature, toggleUnavailable } from "./actions";
import { Onboarding } from "@/components/Onboarding";
import { incompleteWorkers } from "@/lib/completeness";
import { privacySignature } from "@/lib/privacy";
import { pushConfig } from "@/lib/push";

const DAYS_AHEAD = 56;

export default async function WorkerHome() {
  const me = await requireWorker();
  const t = today();
  const worker = await db.worker.findUniqueOrThrow({
    where: { id: me.id },
    include: {
      assignments: {
        where: { event: { date: { gte: addDays(t, -60) } } },
        include: { event: { include: { savedVenue: { select: { accessNotes: true } } } } },
        orderBy: { event: { date: "asc" } },
      },
      unavailabilities: { where: { date: { gte: t, lte: addDays(t, DAYS_AHEAD) } } },
    },
  });

  // Tarjeta de fichaje: el día del evento y, si pasa de medianoche, hasta que cierra la ventana de fichaje
  const now = new Date();
  const clockable = worker.assignments.filter(
    (a) =>
      a.status === "CONFIRMADO" &&
      (a.event.date === t || (a.event.date === addDays(t, -1) && now <= clockWindow(a.event, a.role).closesAt)),
  );
  const pending = worker.assignments.filter((a) => a.status === "CONVOCADO" && a.event.date >= t);
  const upcoming = worker.assignments.filter((a) => a.status === "CONFIRMADO" && a.event.date >= t && !clockable.includes(a));
  const history = worker.assignments
    .filter((a) => a.status === "CONFIRMADO" && a.event.date < t && !clockable.includes(a))
    .reverse()
    .slice(0, 10);
  const unread = await unreadCounts(
    { kind: "worker", id: me.id, name: me.name, role: me.role },
    [...clockable, ...upcoming].map((a) => a.eventId),
  );

  const [uniform, toSign, polls] = await Promise.all([
    getUniform(),
    db.contract.findMany({
      where: { workerId: me.id, signedAt: null, OR: [{ assignment: { status: "CONFIRMADO" } }, { kind: { in: ["RGPD", "JORNADA"] } }] },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    }),
    openPollsFor(worker),
  ]);
  const toReview = worker.assignments.some((a) => isLeadRole(a.role)) ? await pendingReviews(me.id) : [];
  // Bienvenida guiada: protección de datos, datos y documentos, avisos
  const [privacy, incomplete, devices] = await Promise.all([
    privacySignature(me.id),
    incompleteWorkers([me.id]),
    db.device.count({ where: { workerId: me.id } }),
  ]);
  const dataMissing = (incomplete[0]?.missing ?? []).filter((m) => m !== "firma de protección de datos" && m !== "foto de perfil");
  const steps = [
    {
      key: "foto",
      title: "Sube tu foto de perfil",
      text: worker.photoStatus === "RECHAZADA" ? `Tu foto no vale (${worker.photoNote ?? "sube otra"}). Sube otra de frente, con la cara bien visible.` : "De frente y con la cara bien visible. RRHH la revisa.",
      done: !!worker.photoFileId && worker.photoStatus !== "RECHAZADA",
    },
    { key: "rgpd", title: "Firma la información de protección de datos", text: "Lee qué datos tratamos y para qué, y fírmalo con el dedo.", done: !!privacy },
    { key: "datos", title: "Completa tus datos y documentos", text: `Necesitamos tu DNI, Seguridad Social e IBAN con sus documentos para darte de alta y pagarte.${dataMissing.length ? ` Te falta: ${dataMissing.join(", ")}.` : ""}`, done: !!privacy && dataMissing.length === 0 },
    { key: "avisos", title: "Activa los avisos", text: "Así te enteras al momento de convocatorias, cambios y mensajes del chat.", done: devices > 0 },
  ];
  const blocked = toReview.some((p) => p.overdue);

  const unavailable = new Set(worker.unavailabilities.map((u) => u.date));
  const busy = new Set(worker.assignments.filter((a) => ["CONVOCADO", "CONFIRMADO"].includes(a.status)).map((a) => a.event.date));
  const offset = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7; // semana empieza en lunes
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(t, i));

  const ChatLink = ({ eventId }: { eventId: string }) => {
    const n = unread.get(eventId) ?? 0;
    return (
      <Link href={`/app/eventos/${eventId}`} className="btn w-full">
        💬 Chat del evento
        {n > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-xs text-white">{n}</span>}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-stone-500">{ROLE_LABEL[worker.role as Role]}</p>
        <h1>Hola, {worker.name.split(" ")[0]}</h1>
      </header>

      {steps.some((st) => !st.done) && <Onboarding name={worker.name.split(" ")[0]} steps={steps} push={await pushConfig()} signAction={startPrivacySignature} />}

      {polls.map((p) => <PollCard key={p.id} poll={p} busy={busy} />)}

      {toSign.length > 0 && (
        <section className="card space-y-2 border-stone-300 bg-stone-100">
          <h2>✍️ Documentos para firmar</h2>
          {toSign.map((c) => (
            <Link key={c.id} href={`/app/firmar/${c.id}`} className="btn w-full justify-between">
              <span className="truncate">{c.title}</span>
              <span className="text-xs">Firmar ›</span>
            </Link>
          ))}
        </section>
      )}

      {toReview.length > 0 && (
        <section className={`card space-y-2 ${blocked ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
          <h2>⭐ Valora a tu equipo</h2>
          <p className="text-sm">
            {blocked
              ? "Tienes valoraciones atrasadas. Hasta que las completes no podrás aceptar nuevas convocatorias."
              : "Como responsable del evento, puntúa al personal. RRHH lo usa para elegir los equipos."}
          </p>
          {toReview.map((p) => (
            <Link key={p.id} href={`/app/eventos/${p.id}/valorar`} className="btn w-full justify-between">
              <span>{p.name} · {formatDate(p.date)}</span>
              <span className="text-xs">{p.missing} de {p.total} pendientes</span>
            </Link>
          ))}
        </section>
      )}


      {clockable.map((a) => (
        <section key={a.id} className="card space-y-3 border-brand-600 ring-2 ring-brand-100">
          <h2>Hoy trabajas</h2>
          <EventInfo event={a.event} role={a.role} />
          <Checklist id={a.id} {...checklistFor(uniform, a.role, a.event.checklist)} extra={lines(a.event.checklist)} />
          <ClockButtons
            assignmentId={a.id}
            checkIn={a.checkIn}
            checkOut={a.checkOut}
            windowText={(() => {
              const w = clockWindow(a.event, a.role);
              return `Fichaje con ubicación: de ${hhmm(w.opensAt)} a ${hhmm(w.closesAt)}, a menos de ${CLOCK_RADIUS_M} m del evento.`;
            })()}
            rules={(() => {
              const w = clockWindow(a.event, a.role);
              return { opensAt: w.opensAt.toISOString(), closesAt: w.closesAt.toISOString(), lat: a.event.lat, lng: a.event.lng, radius: CLOCK_RADIUS_M };
            })()}
          />
          <ChatLink eventId={a.eventId} />
          {isLeadRole(a.role) && (
            <Link href={`/app/eventos/${a.eventId}/equipo`} className="btn btn-primary w-full">👥 Panel del equipo e incidencias</Link>
          )}
        </section>
      ))}

      <section className="space-y-3">
        <h2>Convocatorias pendientes {pending.length > 0 && <span className="text-amber-600">({pending.length})</span>}</h2>
        {pending.length === 0 && <p className="text-sm text-stone-500">No tienes convocatorias pendientes de responder.</p>}
        {pending.map((a) => (
          <div key={a.id} className="card space-y-3 border-amber-300">
            <EventInfo event={a.event} role={a.role} />
            <div className="grid grid-cols-2 gap-2">
              <form action={respond.bind(null, a.id, true)}>
                <button className="btn btn-success w-full py-3" disabled={blocked} title={blocked ? "Completa antes tus valoraciones pendientes" : undefined}>
                  Acepto
                </button>
              </form>
              <form action={respond.bind(null, a.id, false)}>
                <button className="btn btn-danger w-full py-3">No puedo</button>
              </form>
            </div>
            <p className="text-xs text-stone-500">Al aceptar entras en el chat del evento con RRHH y el resto del equipo.</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2>Próximos servicios confirmados</h2>
        {upcoming.length === 0 && <p className="text-sm text-stone-500">Ninguno por ahora.</p>}
        {upcoming.map((a) => {
          const n = unread.get(a.eventId) ?? 0;
          return (
            <Link key={a.id} href={`/app/eventos/${a.eventId}`} className="card flex items-center justify-between gap-2">
              <span>
                <span className="font-medium">{a.event.name}</span>
                <span className="block text-sm text-stone-500">
                  {formatDate(a.event.date)} · {callTime(a.event, a.role)} · {a.event.venue}
                </span>
              </span>
              {n > 0 ? (
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">{n}</span>
              ) : (
                <span className="text-stone-400">›</span>
              )}
            </Link>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2>Mi disponibilidad</h2>
        <p className="text-sm text-stone-500">
          Toca un día para marcarlo como <strong className="text-red-600">no disponible</strong> (o para quitarlo).
        </p>
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
              <form key={d} action={toggleUnavailable.bind(null, d)}>
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
    </div>
  );
}
