"use client";

import { startTransition, useActionState, useRef } from "react";
import { INCIDENT_LABEL, INCIDENT_TYPES } from "@/lib/incidentTypes";
import { shrinkImage } from "@/lib/image";
import type { IncidentResult } from "@/lib/incidents";

type Action = (prev: IncidentResult | null, form: FormData) => Promise<IncidentResult>;

export function IncidentForm({ action, team }: { action: Action; team: { id: string; name: string }[] }) {
  const [result, run, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
        form.delete("photos");
        for (const p of photos.slice(0, 5)) form.append("photos", await shrinkImage(p));
        startTransition(() => run(form));
      }}
    >
      <h2>⚠ Registrar incidencia</h2>
      <select name="type" className="input" required defaultValue="">
        <option value="" disabled>Tipo de incidencia…</option>
        {INCIDENT_TYPES.map((t) => (
          <option key={t} value={t}>{INCIDENT_LABEL[t]}</option>
        ))}
      </select>
      <select name="workerId" className="input" defaultValue="">
        <option value="">Persona implicada (opcional)</option>
        {team.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <textarea name="description" className="input text-base sm:text-sm" rows={3} required placeholder="¿Qué ha pasado?" maxLength={2000} />
      <label className="block text-sm">
        Fotos (hasta 5)
        <input name="photos" type="file" accept="image/*" multiple className="mt-1 block w-full text-sm" />
      </label>
      {result && (
        <p role="status" className={`rounded-lg p-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {result.message}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Enviando…" : "Registrar incidencia"}</button>
    </form>
  );
}
