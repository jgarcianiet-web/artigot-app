"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <h1>Artigot Personal</h1>
          <p className="text-sm text-stone-500">Acceso de Recursos Humanos</p>
        </div>
        <div>
          <label className="label" htmlFor="name">Tu nombre</label>
          <input id="name" name="name" className="input" required autoFocus autoComplete="name" placeholder="Aparece en el chat de los eventos" />
        </div>
        <div>
          <label className="label" htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
        <p className="text-center text-xs text-stone-400">
          ¿Eres camarero, maître o mozo? <a href="/entrar" className="hover:underline">Entra aquí</a>
        </p>
      </form>
    </main>
  );
}
