"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { backupNowAction, migrateFilesAction } from "./actions";

export function BackupButton() {
  const [msg, run] = useActionState(backupNowAction, null);
  return (
    <form action={run} className="flex flex-wrap items-center gap-2">
      <SubmitButton>Hacer copia ahora</SubmitButton>
      {msg && <span className="text-sm text-stone-700">{msg}</span>}
    </form>
  );
}

export function MigrateButton({ remaining }: { remaining: number }) {
  const [msg, run] = useActionState(migrateFilesAction, null);
  if (!remaining && !msg) return null;
  return (
    <form action={run} className="flex flex-wrap items-center gap-2">
      {remaining > 0 && <SubmitButton className="btn">Mover ya los {remaining} archivos al almacén</SubmitButton>}
      {msg && <span className="text-sm text-stone-700">{msg}</span>}
    </form>
  );
}
