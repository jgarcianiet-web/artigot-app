"use client";

import { ActionForm } from "@/components/client";
import { useActionState } from "react";
import { login, setupFirstAdmin } from "../actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <ActionForm action={action} className="card w-full max-w-sm space-y-4">
      <div>
        <h1>Artigot Personal</h1>
        <p className="text-sm text-stone-500">Acceso de Recursos Humanos</p>
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required autoFocus autoComplete="username" />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      <p className="text-center text-xs text-stone-400">
        ¿Eres camarero, maître o mozo? <a href="/entrar" className="hover:underline">Entra aquí</a>
      </p>
    </ActionForm>
  );
}

export function SetupForm() {
  const [error, action, pending] = useActionState(setupFirstAdmin, null);
  return (
    <ActionForm action={action} className="card w-full max-w-sm space-y-4">
      <div>
        <h1>Primer acceso</h1>
        <p className="text-sm text-stone-500">
          Crea el primer usuario de RRHH. Necesitas la clave de instalación (la variable <code>ADMIN_PASSWORD</code> del servidor).
          Después podrás dar de alta al resto desde «Usuarios».
        </p>
      </div>
      <div>
        <label className="label" htmlFor="setupKey">Clave de instalación</label>
        <input id="setupKey" name="setupKey" type="password" className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="name">Tu nombre</label>
        <input id="name" name="name" className="input" required placeholder="Aparece en el chat de los eventos" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="username" />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña (mínimo 8 caracteres)</label>
        <input id="password" name="password" type="password" minLength={8} className="input" required autoComplete="new-password" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Creando…" : "Crear usuario y entrar"}</button>
    </ActionForm>
  );
}
