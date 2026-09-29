"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "../app/actions";

export default function WorkerLogin() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <h1>Artigot Personal</h1>
          <p className="text-sm text-stone-500">Entra con tu teléfono y el código de 6 cifras que te ha dado RRHH.</p>
        </div>
        <div>
          <label className="label" htmlFor="phone">Teléfono</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" className="input text-base" required />
        </div>
        <div>
          <label className="label" htmlFor="code">Código de acceso</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            className="input text-center font-mono text-xl tracking-[0.5em]"
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn btn-primary w-full py-3 text-base" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
        <p className="text-center text-xs text-stone-400">
          <Link href="/login" className="hover:underline">Acceso RRHH</Link>
        </p>
      </form>
    </main>
  );
}
