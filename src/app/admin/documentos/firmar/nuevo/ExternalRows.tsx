"use client";

import { useState } from "react";

type Channel = "EMAIL" | "WHATSAPP";
type Row = { name: string; dni: string; email: string; phone: string; channel: Channel };
const empty: Row = { name: "", dni: "", email: "", phone: "", channel: "EMAIL" };

/**
 * Personas de fuera de la plataforma y cómo se les envía: por email (enlace y código a su email) o por WhatsApp (RRHH
 * les manda el enlace y, al abrirlo, escriben su DNI/NIE).
 */
export function ExternalRows() {
  const [rows, setRows] = useState<Row[]>([]);
  const set = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="card space-y-3">
      <div>
        <h2>Personas de fuera de la plataforma</h2>
        <p className="text-sm text-stone-500">
          Candidatos, antiguos trabajadores, proveedores… Elige cómo se lo envías: <b>por email</b> le llega el enlace y, para abrirlo, un código a ese
          email; <b>por WhatsApp</b> se lo mandas tú desde el envío y, al abrirlo, escribe su DNI/NIE.
        </p>
      </div>
      <input type="hidden" name="externals" value={JSON.stringify(rows)} />
      {rows.map((r, i) => {
        const wa = r.channel === "WHATSAPP";
        return (
          <fieldset key={i} className="space-y-2 rounded-lg bg-stone-50 p-3" aria-label={`Persona de fuera ${i + 1}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium">Enviar por</span>
              {(["EMAIL", "WHATSAPP"] as const).map((c) => (
                <label key={c} className="flex items-center gap-1.5">
                  <input type="radio" name={`channel-${i}`} value={c} checked={r.channel === c} onChange={() => set(i, "channel", c)} className="size-4" />
                  {c === "EMAIL" ? "Email" : "WhatsApp"}
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="Nombre y apellidos" placeholder="Nombre y apellidos" className="input" value={r.name} onChange={(e) => set(i, "name", e.target.value)} required />
              <input aria-label="DNI/NIE" placeholder={wa ? "DNI/NIE (con él abre el documento)" : "DNI/NIE (opcional)"} className="input" value={r.dni} onChange={(e) => set(i, "dni", e.target.value)} required={wa} />
              {wa ? (
                <input aria-label="Móvil" type="tel" placeholder="Móvil (WhatsApp)" className="input" value={r.phone} onChange={(e) => set(i, "phone", e.target.value)} required />
              ) : (
                <input aria-label="Email" type="email" placeholder="Email" className="input" value={r.email} onChange={(e) => set(i, "email", e.target.value)} required />
              )}
              <div className="flex gap-2">
                {wa ? (
                  <input aria-label="Email" type="email" placeholder="Email (opcional)" className="input" value={r.email} onChange={(e) => set(i, "email", e.target.value)} />
                ) : (
                  <input aria-label="Móvil" type="tel" placeholder="Móvil (opcional)" className="input" value={r.phone} onChange={(e) => set(i, "phone", e.target.value)} />
                )}
                <button type="button" className="btn btn-danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>
              </div>
            </div>
          </fieldset>
        );
      })}
      <button type="button" className="btn" onClick={() => setRows((r) => [...r, empty])}>+ Añadir persona de fuera</button>
    </div>
  );
}
