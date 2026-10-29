"use client";

import { useState } from "react";

type Row = { name: string; dni: string; email: string; phone: string };
const empty: Row = { name: "", dni: "", email: "", phone: "" };

/** Personas de fuera de la plataforma: nombre, DNI (opcional), email (para el código) y móvil (opcional, para WhatsApp). */
export function ExternalRows() {
  const [rows, setRows] = useState<Row[]>([]);
  const set = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="card space-y-3">
      <div>
        <h2>Personas de fuera de la plataforma</h2>
        <p className="text-sm text-stone-500">
          Candidatos, antiguos trabajadores, proveedores… Les llega un enlace por email y, para abrirlo, un código a ese mismo email. También
          puedes copiar su enlace y mandárselo por WhatsApp.
        </p>
      </div>
      <input type="hidden" name="externals" value={JSON.stringify(rows)} />
      {rows.map((r, i) => (
        <fieldset key={i} className="grid gap-2 rounded-lg bg-stone-50 p-3 sm:grid-cols-2" aria-label={`Persona de fuera ${i + 1}`}>
          <input aria-label="Nombre y apellidos" placeholder="Nombre y apellidos" className="input" value={r.name} onChange={(e) => set(i, "name", e.target.value)} required />
          <input aria-label="Email" type="email" placeholder="Email" className="input" value={r.email} onChange={(e) => set(i, "email", e.target.value)} required />
          <input aria-label="DNI/NIE" placeholder="DNI/NIE (opcional)" className="input" value={r.dni} onChange={(e) => set(i, "dni", e.target.value)} />
          <div className="flex gap-2">
            <input aria-label="Móvil" type="tel" placeholder="Móvil (opcional)" className="input" value={r.phone} onChange={(e) => set(i, "phone", e.target.value)} />
            <button type="button" className="btn btn-danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>
          </div>
        </fieldset>
      ))}
      <button type="button" className="btn" onClick={() => setRows((r) => [...r, empty])}>+ Añadir persona de fuera</button>
    </div>
  );
}
