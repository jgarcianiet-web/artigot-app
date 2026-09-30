"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { generateTimeRecordsAction } from "./actions";

export function GenerateButton({ month, label }: { month: string; label: string }) {
  const [msg, run] = useActionState(generateTimeRecordsAction.bind(null, month), null);
  return (
    <form action={run} className="flex flex-wrap items-center gap-2">
      <SubmitButton>{label}</SubmitButton>
      {msg && <span className="text-sm text-stone-700">{msg}</span>}
    </form>
  );
}
