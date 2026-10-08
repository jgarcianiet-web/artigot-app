"use client";

import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { sendTestMail } from "./testMail";

export function TestMailForm({ email }: { email: string }) {
  const [r, action] = useActionState(sendTestMail, null);
  return (
    <ActionForm action={action} className="card space-y-2">
      <h2 className="text-base">✉️ Email de prueba</h2>
      <p className="text-sm text-stone-500">Comprueba que el envío de emails (SMTP de Railway) funciona.</p>
      <div className="flex flex-wrap gap-2">
        <input name="to" type="email" defaultValue={email} className="input max-w-xs" aria-label="Enviar a" />
        <SubmitButton className="btn">Enviar email de prueba</SubmitButton>
      </div>
      {r && <p className={`text-sm ${r.ok ? "text-emerald-800" : "text-red-700"}`}>{r.message}</p>}
    </ActionForm>
  );
}
