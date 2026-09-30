"use client";

import { useState } from "react";

type Point = { key: string; label: string; value: number; detail?: string };

const euro = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/**
 * Columnas de una sola serie (coste por mes). Marcas finas con extremo redondeado sobre la base,
 * rejilla discreta, etiqueta directa solo en el máximo y el último mes, tooltip al pasar o enfocar
 * y tabla equivalente debajo.
 */
export function MonthlyBars({ title, points, format = euro }: { title: string; points: Point[]; format?: (n: number) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 0);
  const top = max > 0 ? niceMax(max) : 1;
  const ticks = [0, top / 2, top];
  const maxIdx = points.findIndex((p) => p.value === max);
  const lastIdx = points.length - 1;
  const H = 180;

  return (
    <figure className="viz-root card space-y-3">
      <style>{`
        .viz-root { --series-1: #2a78d6; --grid: #e7e5e4; --axis-text: #78716c; --tip-bg: #1c1917; --tip-text: #ffffff; }
      `}</style>
      <figcaption className="font-semibold">{title}</figcaption>
      <div className="relative flex gap-2" style={{ height: H + 24 }}>
        {/* Eje Y */}
        <div className="relative w-14 shrink-0 text-right text-[11px]" style={{ height: H, color: "var(--axis-text)" }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / top) * H }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t" style={{ top: H - (t / top) * H, borderColor: "var(--grid)" }} />
          ))}
          <div className="absolute inset-x-0 top-0 flex items-end" style={{ height: H, gap: 2 }}>
            {points.map((p, i) => {
              const h = (p.value / top) * H;
              const labelled = p.value > 0 && (i === maxIdx || i === lastIdx);
              return (
                <button
                  key={p.key}
                  type="button"
                  className="relative flex h-full flex-1 items-end justify-center outline-none"
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  aria-label={`${p.label}: ${format(p.value)}${p.detail ? `, ${p.detail}` : ""}`}
                >
                  <span
                    className="block w-full max-w-7 rounded-t"
                    style={{ height: Math.max(h, p.value > 0 ? 2 : 0), background: "var(--series-1)", opacity: active == null || active === i ? 1 : 0.55 }}
                  />
                  {labelled && (
                    <span className="absolute text-[11px] font-medium whitespace-nowrap text-stone-700" style={{ bottom: h + 4 }}>
                      {format(p.value)}
                    </span>
                  )}
                  {active === i && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-left text-xs whitespace-nowrap shadow"
                      style={{ bottom: h + 22, background: "var(--tip-bg)", color: "var(--tip-text)" }}
                    >
                      <span className="block font-semibold">{p.label}</span>
                      {format(p.value)}
                      {p.detail && <span className="block opacity-80">{p.detail}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="absolute inset-x-0 flex" style={{ top: H + 6, gap: 2 }}>
            {points.map((p) => (
              <span key={p.key} className="flex-1 text-center text-[11px]" style={{ color: "var(--axis-text)" }}>
                {p.label.split(" ")[0]}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-stone-500">Ver como tabla</summary>
        <table className="table mt-2">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="text-right">Valor</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                <td className="text-right">{format(p.value)}</td>
                <td className="text-stone-500">{p.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Redondea el máximo del eje a un valor limpio (1, 2, 2,5 o 5 × 10ⁿ). */
function niceMax(v: number) {
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}
