import Link from "next/link";
import { db } from "@/lib/db";
import { addDays, EVENT_TYPE_LABEL, formatDate, ROLE_PLURAL, today } from "@/lib/domain";
import { coverage } from "@/lib/staffing";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes

type Cov = ReturnType<typeof coverage>;

/** Verde: completo · Ámbar: cubierto con respuestas pendientes · Rojo: faltan personas. */
function state(cov: Cov) {
  const need = cov.reduce((s, c) => s + c.need, 0);
  const confirmed = cov.reduce((s, c) => s + Math.min(c.confirmed, c.need), 0);
  const covered = cov.reduce((s, c) => s + Math.min(c.confirmed + c.pending, c.need), 0);
  if (confirmed >= need) return { need, confirmed, cls: "border-emerald-300 bg-emerald-50 text-emerald-900", label: "Completo" };
  if (covered >= need) return { need, confirmed, cls: "border-amber-300 bg-amber-50 text-amber-900", label: "Pendiente de respuestas" };
  return { need, confirmed, cls: "border-red-300 bg-red-50 text-red-900", label: "Faltan personas" };
}

export default async function Calendar({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const t = today();
  const sp = await searchParams;
  const month = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : t.slice(0, 7);
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridStart = addDays(first, -weekday(first));
  const gridEnd = addDays(last, 6 - weekday(last));
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const [events, activeWorkers, unavailable, busy] = await Promise.all([
    db.event.findMany({
      where: { date: { gte: gridStart, lte: gridEnd } },
      include: { assignments: { select: { role: true, status: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.worker.count({ where: { active: true } }),
    db.unavailability.findMany({
      where: { date: { gte: gridStart, lte: gridEnd }, worker: { active: true } },
      select: { date: true, workerId: true },
    }),
    db.assignment.findMany({
      where: { status: { in: ["CONVOCADO", "CONFIRMADO"] }, event: { date: { gte: gridStart, lte: gridEnd } } },
      select: { workerId: true, event: { select: { date: true } } },
    }),
  ]);

  // Personal libre por día: activos que ni han marcado el día como no disponible ni están ya en otro evento
  const takenByDay = new Map<string, Set<string>>();
  const take = (date: string, workerId: string) => {
    if (!takenByDay.has(date)) takenByDay.set(date, new Set());
    takenByDay.get(date)!.add(workerId);
  };
  unavailable.forEach((u) => take(u.date, u.workerId));
  busy.forEach((b) => take(b.event.date, b.workerId));

  const byDay = new Map<string, typeof events>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const monthEvents = events.filter((e) => e.date >= first && e.date <= last);
  const [y, m] = month.split("-").map(Number);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="first-letter:uppercase">
          {MONTHS[m - 1]} {y}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/calendario?mes=${shiftMonth(month, -1)}`} className="btn" aria-label="Mes anterior">‹</Link>
          <Link href="/admin/calendario" className="btn">Hoy</Link>
          <Link href={`/admin/calendario?mes=${shiftMonth(month, 1)}`} className="btn" aria-label="Mes siguiente">›</Link>
          <Link href="/admin/eventos/nuevo" className="btn btn-primary">+ Evento</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-stone-600">
        <span><span className="mr-1 inline-block size-3 rounded border border-emerald-300 bg-emerald-50 align-middle" />Completo</span>
        <span><span className="mr-1 inline-block size-3 rounded border border-amber-300 bg-amber-50 align-middle" />Cubierto, faltan respuestas</span>
        <span><span className="mr-1 inline-block size-3 rounded border border-red-300 bg-red-50 align-middle" />Faltan personas</span>
        <span>· «libres» = personal activo sin evento ni día bloqueado</span>
      </div>

      {/* Mes en cuadrícula (tablet y ordenador) */}
      <div className="hidden overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm sm:block">
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-xs font-semibold text-stone-500">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const inMonth = d >= first && d <= last;
            const dayEvents = byDay.get(d) ?? [];
            const free = activeWorkers - (takenByDay.get(d)?.size ?? 0);
            const past = d < t;
            return (
              <div
                key={d}
                className={`group min-h-32 border-r border-b border-stone-100 p-1.5 [&:nth-child(7n)]:border-r-0 ${
                  inMonth ? "" : "bg-stone-50/70"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-xs ${
                      d === t ? "bg-brand-600 font-semibold text-white" : inMonth ? "text-stone-700" : "text-stone-400"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {!past && (
                    <Link
                      href={`/admin/eventos/nuevo?fecha=${d}`}
                      className="rounded px-1 text-sm text-stone-400 opacity-0 group-hover:opacity-100 hover:bg-stone-100 hover:text-brand-700 focus:opacity-100"
                      title="Nuevo evento este día"
                    >
                      +
                    </Link>
                  )}
                </div>
                <div className="space-y-1">
                  {dayEvents.map((e) => {
                    const cov = coverage(e, e.assignments);
                    const s = state(cov);
                    return (
                      <Link
                        key={e.id}
                        href={`/admin/eventos/${e.id}`}
                        className={`block rounded border px-1.5 py-1 text-[11px] leading-tight hover:shadow ${s.cls} ${e.status === "CERRADO" ? "opacity-60" : ""}`}
                        title={`${e.name} · ${e.venue}\n${s.label}\n${cov
                          .filter((c) => c.need)
                          .map((c) => `${ROLE_PLURAL[c.role]}: ${c.confirmed}/${c.need}`)
                          .join(" · ")}`}
                      >
                        <span className="font-semibold">{e.startTime}</span> <span className="break-words">{e.name}</span>
                        <span className="block opacity-80">
                          {s.confirmed}/{s.need} {e.lat == null && "· ⚠ sin ubicación"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                {inMonth && !past && (
                  <div className={`mt-1 text-[10px] ${free <= 5 ? "font-medium text-red-600" : "text-stone-400"}`}>{free} libres</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista (móvil) */}
      <div className="space-y-2 sm:hidden">
        {monthEvents.length === 0 && <p className="text-sm text-stone-500">No hay eventos este mes.</p>}
        {monthEvents.map((e) => {
          const s = state(coverage(e, e.assignments));
          return (
            <Link key={e.id} href={`/admin/eventos/${e.id}`} className={`block rounded-lg border p-3 ${s.cls}`}>
              <div className="text-xs font-medium uppercase">
                {formatDate(e.date)} · {e.startTime} · {EVENT_TYPE_LABEL[e.type]}
              </div>
              <div className="font-semibold">{e.name}</div>
              <div className="text-sm">
                {e.venue} · {s.confirmed}/{s.need} confirmados
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
