"use client";

import { startTransition, useActionState } from "react";
import { shrinkImage } from "@/lib/image";
import { apply } from "./actions";

// La solicitud pública es solo para camareros y mozos (maîtres y responsables se gestionan desde RRHH)
const ROLES: [string, string][] = [
  ["CAMARERO", "Camarero/a"],
  ["MOZO", "Mozo (montaje y descarga)"],
];

export function ApplyForm({ countries }: { countries: string[] }) {
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
        <label className="block text-sm">Email<input name="email" type="email" className="input mt-1 text-base" required autoComplete="email" /></label>
      </div>
      <label className="block text-sm">Localidad<input name="zone" className="input mt-1 text-base" placeholder="¿Dónde vives?" /></label>
      <fieldset>
        <legend className="mb-1 text-sm">¿Tienes coche para ir a los eventos?</legend>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="hasCar" value="1" className="size-4" required /> Sí</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="hasCar" value="0" className="size-4" /> No</label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm">¿De qué puedes trabajar?</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {ROLES.map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" name="roles" value={v} className="size-4" /> {l}</label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-stone-200 p-3">
        <legend className="px-1 text-sm font-semibold">Datos para darte de alta</legend>
        <p className="text-xs text-stone-500">Solo se usan si te contratamos, para darte de alta en la Seguridad Social sin hacerte esperar.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">DNI / NIE<input name="dni" className="input mt-1 text-base uppercase" required autoComplete="off" placeholder="12345678Z" /></label>
          <label className="block text-sm">Fecha de nacimiento<input name="birthDate" type="date" className="input mt-1 text-base" required /></label>
          <fieldset>
            <legend className="mb-1 text-sm">Sexo</legend>
            <div className="flex gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="sex" value="Mujer" className="size-4" required /> Mujer</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="sex" value="Hombre" className="size-4" /> Hombre</label>
            </div>
          </fieldset>
          <label className="block text-sm">
            Nacionalidad
            <select name="nationality" className="input mt-1 text-base" defaultValue={countries.includes("ESPAÑA") ? "ESPAÑA" : ""} required>
              <option value="">— Elige —</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            Nº de la Seguridad Social <span className="text-stone-400">(si lo tienes)</span>
            <input name="nss" inputMode="numeric" className="input mt-1 text-base" autoComplete="off" placeholder="12 cifras" />
          </label>
          <label className="block text-sm">
            IBAN para cobrar <span className="text-stone-400">(si lo tienes)</span>
            <input name="iban" className="input mt-1 text-base uppercase" autoComplete="off" placeholder="ES00 0000 0000 0000 0000 0000" />
          </label>
        </div>
      </fieldset>
      <label className="block text-sm">Experiencia<textarea name="experience" rows={3} className="input mt-1 text-base" placeholder="Dónde has trabajado, cuántos años, idiomas…" /></label>
      <label className="block text-sm">Disponibilidad<input name="availability" className="input mt-1 text-base" placeholder="Fines de semana, entre semana, verano…" /></label>
      <label className="block text-sm">Currículum (PDF o foto)<input name="cv" type="file" accept="application/pdf,image/*" className="mt-1 block w-full text-sm" required /></label>
      {/* Campo trampa para robots: oculto a las personas */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" value="1" className="mt-0.5 size-4" required />
        <span>
          Acepto que Artigot trate mis datos para gestionar mi candidatura y contactarme para trabajar en eventos. Si no llego a trabajar con
          vosotros, los guardaréis un máximo de 12 meses. Puedo pedir que los borren en cualquier momento.
        </span>
      </label>
      {r && !r.ok && <p className="text-sm text-red-600">{r.message}</p>}
      <button className="btn btn-primary w-full py-3 text-base" disabled={pending}>{pending ? "Enviando…" : "Enviar solicitud"}</button>
    </form>
  );
}
