"use client";

import { startTransition, useActionState } from "react";
import { shrinkImage } from "@/lib/image";
import { apply } from "./actions";

const ROLES: [string, string][] = [
  ["CAMARERO", "Camarero/a"],
  ["RESPONSABLE", "Camarero/a responsable"],
  ["MAITRE", "Maître"],
  ["MOZO", "Mozo (montaje y descarga)"],
];

export function ApplyForm() {
  const [r, run, pending] = useActionState(apply, null);
  if (r?.ok) {
    return <p role="status" className="card bg-emerald-50 text-emerald-900">{r.message}</p>;
  }
  return (
    <form
      className="card space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const cv = form.get("cv");
        if (cv instanceof File && cv.type.startsWith("image/")) form.set("cv", await shrinkImage(cv));
        startTransition(() => run(form));
      }}
    >
      <label className="block text-sm">Nombre y apellidos<input name="name" className="input mt-1 text-base" required autoComplete="name" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Teléfono<input name="phone" type="tel" className="input mt-1 text-base" required autoComplete="tel" /></label>
        <label className="block text-sm">Email (opcional)<input name="email" type="email" className="input mt-1 text-base" autoComplete="email" /></label>
      </div>
      <label className="block text-sm">Localidad<input name="zone" className="input mt-1 text-base" placeholder="¿Dónde vives? ¿Tienes coche?" /></label>
      <fieldset>
        <legend className="mb-1 text-sm">¿De qué puedes trabajar?</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {ROLES.map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" name="roles" value={v} className="size-4" /> {l}</label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">Experiencia<textarea name="experience" rows={3} className="input mt-1 text-base" placeholder="Dónde has trabajado, cuántos años, idiomas…" /></label>
      <label className="block text-sm">Disponibilidad<input name="availability" className="input mt-1 text-base" placeholder="Fines de semana, entre semana, verano…" /></label>
      <label className="block text-sm">CV o foto (opcional, PDF o imagen)<input name="cv" type="file" accept="application/pdf,image/*" className="mt-1 block w-full text-sm" /></label>
      {/* Campo trampa para robots: oculto a las personas */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" value="1" className="mt-0.5 size-4" required />
        <span>
          Acepto que Artigot trate mis datos para gestionar mi candidatura y contactarme para trabajar en eventos. Puedo pedir que los borren en
          cualquier momento.
        </span>
      </label>
      {r && !r.ok && <p className="text-sm text-red-600">{r.message}</p>}
      <button className="btn btn-primary w-full py-3 text-base" disabled={pending}>{pending ? "Enviando…" : "Enviar solicitud"}</button>
    </form>
  );
}
