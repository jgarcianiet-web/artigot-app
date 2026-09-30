"use client";

import { ActionForm } from "@/components/client";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { login } from "../app/actions";
import { Logo } from "@/components/Logo";

export default function WorkerLogin() {
  const [error, action, pending] = useActionState(login, null);
  // Al llegar aquí (sesión cerrada) se borra la copia de la app guardada para usarla sin cobertura
  useEffect(() => {
    caches?.delete("artigot-paginas-v1").catch(() => {});
  }, []);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <ActionForm action={action} className="card w-full max-w-sm space-y-4">
        <div className="space-y-3 text-center">
          <Logo height={56} className="mx-auto" />
          <h1 className="text-base font-medium text-stone-600">Área del personal</h1>
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
          <Link href="/trabaja-con-nosotros" className="hover:underline">¿Quieres trabajar con nosotros?</Link> ·{" "}
          <Link href="/login" className="hover:underline">Acceso RRHH</Link>
        </p>
      </ActionForm>
    </main>
  );
}
