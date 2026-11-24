"use client";

import { startTransition, useActionState, useRef } from "react";

type Result = { ok: boolean; message: string } | null;
const MAX_TOTAL = 38 * 1024 * 1024;

/** Subir documentos del evento para el maître y los camareros responsables (PDF o fotos, varios a la vez). */
export function EventDocsForm({ action }: { action: (prev: Result, form: FormData) => Promise<Result> }) {
  const [r, run, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const total = form.getAll("files").reduce((s, f) => s + (f instanceof File ? f.size : 0), 0);
        if (total > MAX_TOTAL) {
          alert("Entre todos pesan demasiado (máximo 38 MB por envío): súbelos en varias veces.");
          return;
        }
        startTransition(async () => {
          await run(form);
          ref.current?.reset();
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input name="files" type="file" multiple accept="application/pdf,.pdf,image/*" required className="min-w-0 flex-1 text-sm" />
        <input name="title" maxLength={120} placeholder="Título (opcional, si es uno)" className="input w-56" />
        <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Subiendo…" : "Subir"}</button>
      </div>
      {r && <p role="status" className={`text-sm ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.message}</p>}
    </form>
  );
}
