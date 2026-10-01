"use client";

import { useActionState } from "react";
import { emailAccessCode } from "@/app/actions";
import { SubmitButton } from "@/components/client";

export function EmailCode({ id, email }: { id: string; email: string }) {
  const [msg, run] = useActionState(emailAccessCode.bind(null, id), null);
  return (
    <form action={run} className="flex items-center gap-2">
      <SubmitButton className="btn btn-sm">✉ Enviar el código a {email}</SubmitButton>
      {msg && <span className="text-sm text-stone-600">{msg}</span>}
    </form>
  );
}
