"use client";

import { useActionState } from "react";

/** «Confirmar y convocar»: crea el evento y manda la convocatoria al personal previsto. */
export function ConfirmDraft({ action, people }: { action: (prev: string | null) => Promise<string | null>; people: number }) {
  const [error, run, pending] = useActionState(action, null);
  return (
    <form
      action={run}
      className="space-y-1"
      onSubmit={(e) => {
        const text = people
          ? `¿Confirmar el evento y mandar la convocatoria a ${people} ${people === 1 ? "persona" : "personas"}?`
          : "¿Confirmar el evento? Aún no hay nadie previsto: después podrás convocar desde el evento.";
        if (!confirm(text)) e.preventDefault();
      }}
    >
      <button className="btn btn-primary" disabled={pending}>{pending ? "Confirmando…" : `✓ Confirmar y convocar${people ? ` (${people})` : ""}`}</button>
      {error && <p className="max-w-sm text-sm text-red-700">{error}</p>}
    </form>
  );
}
