"use client";

import { startTransition, useOptimistic, useState } from "react";
import { type DayAnswer, SLOT_LABEL, SLOTS } from "@/lib/slots";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const monthFmt = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

type Mark = Exclude<DayAnswer, "DIA">;

/**
 * «Mi disponibilidad»: calendario de un mes, con flechas para pasar de mes. Al tocar un día se elige si ese día
 * puede todo el día (lo normal), solo por la mañana, solo por la tarde o no puede; se ve al momento y se guarda en
 * segundo plano.
 */
export function AvailabilityCalendar({
  today,
  monthsAhead,
  marks: initial,
  busy,
  save,
}: {
  today: string;
  monthsAhead: number;
  /** Días que no son «todo el día»: NO, MANANA o TARDE */
  marks: Record<string, Mark>;
  busy: string[];
  save: (date: string, answer: DayAnswer) => Promise<void>;
}) {
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const [shift, setShift] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [marks, setMark] = useOptimistic(initial, (cur, [d, a]: [string, DayAnswer]) => {
    const next = { ...cur };
    if (a === "DIA") delete next[d];
    else next[d] = a;
    return next;
  });
  const choose = (d: string, a: DayAnswer) =>
    startTransition(async () => {
      setMark([d, a]);
      setSelected(null);
      await save(d, a);
    });
  const work = new Set(busy);

  const first = new Date(Date.UTC(ty, tm + shift, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // la semana empieza en lunes
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const ym = iso(y, m, 1).slice(0, 7);
  const offThisMonth = Object.entries(marks).filter(([d, v]) => v === "NO" && d.startsWith(ym)).length;
  const halfThisMonth = Object.entries(marks).filter(([d, v]) => v !== "NO" && d.startsWith(ym)).length;

  return (
    <div className="card space-y-3 p-3">
      <div className="flex items-center justify-between">
        <button type="button" className="btn btn-sm size-9 p-0" onClick={() => setShift((s) => s - 1)} disabled={shift === 0} aria-label="Mes anterior">‹</button>
        <div className="text-center">
          <div className="font-semibold first-letter:uppercase">{monthFmt.format(first)}</div>
          <div className="text-xs text-stone-500">{offThisMonth || halfThisMonth
              ? [offThisMonth && `${offThisMonth} ${offThisMonth === 1 ? "día" : "días"} no disponible`, halfThisMonth && `${halfThisMonth} ${halfThisMonth === 1 ? "día" : "días"} de media jornada`].filter(Boolean).join(" · ")
              : "Disponible todo el mes"}</div>
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
          const mark = marks[d];
          const isOff = mark === "NO";
          const isWork = work.has(d);
          const label = `${dayFmt.format(new Date(`${d}T12:00:00Z`))}${isWork ? ", tienes servicio" : ""}${isOff ? ", no disponible" : mark === "MANANA" ? ", solo por la mañana" : mark === "TARDE" ? ", solo por la tarde" : ""}`;
          return (
            <button
              key={d}
              type="button"
              disabled={past}
              aria-pressed={selected === d}
              aria-label={label}
              title={label}
              onClick={() => setSelected((s) => (s === d ? null : d))}
              className={`relative flex h-11 items-center justify-center rounded-lg text-sm transition-colors ${
                past
                  ? "text-stone-300"
                  : isOff
                    ? "bg-red-100 font-medium text-red-700 line-through"
                    : mark
                      ? "bg-amber-100 font-medium text-amber-900"
                      : isWork
                      ? "bg-emerald-100 font-semibold text-emerald-800"
                      : "text-stone-800 hover:bg-stone-100 active:bg-stone-200"
              } ${selected === d ? "ring-2 ring-sky-500 ring-inset" : d === today ? "ring-2 ring-brand-600 ring-inset" : ""}`}
            >
              {n}
              {mark && mark !== "NO" && !past && <span className="absolute top-0.5 right-1 text-[9px] font-bold" aria-hidden>{mark === "MANANA" ? "M" : "T"}</span>}
              {isWork && !past && <span className="absolute bottom-1 size-1 rounded-full bg-emerald-600" aria-hidden />}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="rounded-lg bg-sky-50 p-2.5 ring-1 ring-sky-200">
          <p className="mb-2 text-sm font-medium first-letter:uppercase">{dayFmt.format(new Date(`${selected}T12:00:00Z`))}: ¿cuándo puedes?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SLOTS.map((s) => {
              const on = s === "DIA" ? !marks[selected] : marks[selected] === s;
              return (
                <button key={s} type="button" onClick={() => choose(selected, s)} className={`btn btn-sm ${on ? "btn-success" : "bg-white"}`} aria-pressed={on}>
                  {SLOT_LABEL[s]}
                </button>
              );
            })}
            <button type="button" onClick={() => choose(selected, "NO")} className={`btn btn-sm ${marks[selected] === "NO" ? "border-red-700 bg-red-700 text-white" : "bg-white text-red-700"}`} aria-pressed={marks[selected] === "NO"}>
              No puedo
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-100 pt-2 text-xs text-stone-500">
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Tengo servicio</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-amber-100 ring-1 ring-amber-300" /> Solo mañana (M) o tarde (T)</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-red-100 ring-1 ring-red-300" /> No disponible</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded ring-2 ring-brand-600" /> Hoy</span>
      </div>
    </div>
  );
}
