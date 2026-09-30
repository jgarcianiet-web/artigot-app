"use client";

import { useActionState } from "react";
import { generateContractsAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";

export function GenerateContracts({ eventId, pending }: { eventId: string; pending: number }) {
  const [msg, run] = useActionState(generateContractsAction.bind(null, eventId), null);
  return (
    <form action={run} className="flex items-center gap-2">
      {msg && <span className="max-w-md text-sm text-stone-600">{msg}</span>}
      {pending > 0 && <SubmitButton>Enviar a firmar ({pending})</SubmitButton>}
    </form>
  );
}
