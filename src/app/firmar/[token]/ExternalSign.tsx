"use client";

import { useActionState, useState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { SignaturePad } from "@/components/SignaturePad";
import { checkCode, requestCode, signExternal } from "./actions";

/** Paso 1: pedir el código por email y escribirlo. */
export function CodeStep({ token, email, sent }: { token: string; email: string; sent: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [asked, setAsked] = useState(sent);
  const [sending, start] = useTransition();
  const [r, run] = useActionState(checkCode.bind(null, token), null);
  const ask = () =>
    start(async () => {
      const res = await requestCode(token);
      setMsg(res);
      if (res?.ok) setAsked(true);
    });
  return (
    <div className="card space-y-3">
      <p className="text-sm">
        Para comprobar que eres tú, te enviaremos un código de 6 cifras a <strong>{email}</strong>.
      </p>
      <button type="button" onClick={ask} disabled={sending} className={`btn w-full ${asked ? "" : "btn-primary"}`}>
        {sending ? "Enviando…" : asked ? "Enviarme otro código" : "Enviarme el código"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.message}</p>}
      {asked && (
        <ActionForm action={run} className="space-y-2">
          <label className="block text-sm font-medium">
            Código
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required className="input mt-1 text-center text-2xl tracking-[0.4em]" placeholder="••••••" />
          </label>
          {r && !r.ok && <p className="text-sm text-red-600">{r.message}</p>}
          <SubmitButton className="btn btn-primary w-full">Abrir el documento</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

/** Paso 2: firmar. */
export function SignStep({ token }: { token: string }) {
  const [r, run] = useActionState(signExternal.bind(null, token), null);
  if (r?.ok)
    return (
      <div className="card space-y-2 bg-emerald-50">
        <p className="text-emerald-900">{r.message}</p>
        <a href={`/api/firma/${token}/pdf`} target="_blank" className="btn">Ver mi copia firmada</a>
      </div>
    );
  return (
    <ActionForm action={run} className="card space-y-3">
      <SignaturePad />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" value="1" className="mt-0.5 size-4" required />
        He leído el documento entero y lo firmo.
      </label>
      <label className="block text-sm">
        Observaciones <span className="text-stone-500">(opcional)</span>
        <textarea name="note" rows={2} maxLength={1000} className="input mt-1 text-base" />
      </label>
      {r && !r.ok && <p className="text-sm text-red-600">{r.message}</p>}
      <SubmitButton className="btn btn-primary w-full">Firmar</SubmitButton>
    </ActionForm>
  );
}
