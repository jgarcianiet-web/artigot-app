"use client";

import { startTransition, useOptimistic, useState } from "react";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const monthFmt = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * «Mi disponibilidad»: calendario de un mes, con flechas para pasar de mes. Tocar un día lo marca
 * como no disponible (o lo quita); se ve al momento y se guarda en segundo plano.
 */
export function AvailabilityCalendar({
  today,
  monthsAhead,
  unavailable,
  busy,
  toggle,
}: {
  today: string;
  monthsAhead: number;
  unavailable: string[];
  busy: string[];
  toggle: (date: string) => Promise<void>;
}) {
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const [shift, setShift] = useState(0);
  const [off, flip] = useOptimistic(new Set(unavailable), (cur, d: string) => {
    const next = new Set(cur);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    return next;
  });
  const work = new Set(busy);

  const first = new Date(Date.UTC(ty, tm + shift, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // la semana empieza en lunes
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const offThisMonth = [...off].filter((d) => d.startsWith(iso(y, m, 1).slice(0, 7))).length;

  return (
    <div className="card space-y-3 p-3">
      <div className="flex items-center justify-between">
        <button type="button" className="btn btn-sm size-9 p-0" onClick={() => setShift((s) => s - 1)} disabled={shift === 0} aria-label="Mes anterior">‹</button>
        <div className="text-center">
          <div className="font-semibold first-letter:uppercase">{monthFmt.format(first)}</div>
          <div className="text-xs text-stone-500">{offThisMonth ? `${offThisMonth} ${offThisMonth === 1 ? "día" : "días"} no disponible` : "Disponible todo el mes"}</div>
        </div>
        <button type="button" className="btn btn-sm size-9 p-0" onClick={() => setShift((s) => s + 1)} disabled={shift >= monthsAhead} aria-label="Mes siguiente">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-xs font-medium text-stone-500">{d}</div>
        ))}
        {cells.map((n, i) => {
          if (n == null) return <div key={`x${i}`} />;
          const d = iso(y, m, n);
          const past = d < today;
          const isOff = off.has(d);
          const isWork = work.has(d);
          const label = `${dayFmt.format(new Date(`${d}T12:00:00Z`))}${isWork ? ", tienes servicio" : ""}${isOff ? ", no disponible" : ""}`;
          return (
            <button
              key={d}
              type="button"
              disabled={past}
              aria-pressed={isOff}
              aria-label={label}
              title={label}
              onClick={() =>
                startTransition(async () => {
                  flip(d);
                  await toggle(d);
                })
              }
              className={`relative flex h-11 items-center justify-center rounded-lg text-sm transition-colors ${
                past
                  ? "text-stone-300"
                  : isOff
                    ? "bg-red-100 font-medium text-red-700 line-through"
                    : isWork
                      ? "bg-emerald-100 font-semibold text-emerald-800"
                      : "text-stone-800 hover:bg-stone-100 active:bg-stone-200"
              } ${d === today ? "ring-2 ring-brand-600 ring-inset" : ""}`}
            >
              {n}
              {isWork && !past && <span className="absolute bottom-1 size-1 rounded-full bg-emerald-600" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-100 pt-2 text-xs text-stone-500">
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Tengo servicio</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-red-100 ring-1 ring-red-300" /> No disponible</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded ring-2 ring-brand-600" /> Hoy</span>
      </div>
    </div>
  );
}
