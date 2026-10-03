"use client";

import { ActionForm } from "@/components/client";
import { useActionState } from "react";
import { login, loginCode, setupFirstAdmin } from "../actions";
import { Logo } from "@/components/Logo";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  if (state?.code) return <CodeForm email={state.email ?? ""} />;
  return (
    <ActionForm action={action} className="card w-full max-w-sm space-y-4">
      <div className="space-y-3 text-center">
        <Logo height={56} className="mx-auto" />
        <h1 className="text-base font-medium text-stone-600">Acceso de Recursos Humanos</h1>
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required autoFocus autoComplete="username" />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      <p className="text-center text-xs text-stone-400">
        ¿Eres camarero, maître o mozo? <a href="/entrar" className="hover:underline">Entra aquí</a>
      </p>
    </ActionForm>
  );
}

/** Segundo paso: el código de 6 cifras que llega por email al entrar desde un navegador nuevo. */
function CodeForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(loginCode, null);
  return (
    <ActionForm action={action} className="card w-full max-w-sm space-y-4">
      <div className="space-y-3 text-center">
        <Logo height={56} className="mx-auto" />
        <h1 className="text-base font-medium text-stone-600">Código de verificación</h1>
        <p className="text-sm text-stone-600">Te hemos enviado un código de 6 cifras a <strong>{email}</strong>. Caduca en 10 minutos.</p>
      </div>
      <input type="hidden" name="email" value={email} />
      <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} className="input text-center text-2xl tracking-[0.4em]" placeholder="000000" required autoFocus aria-label="Código" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="trust" value="1" defaultChecked className="mt-0.5 size-4 shrink-0" />
        <span>Confiar en este navegador durante 90 días (no lo marques en un ordenador compartido)</span>
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Comprobando…" : "Entrar"}</button>
      <p className="text-center text-xs text-stone-400"><a href="/login" className="hover:underline">Volver a empezar</a></p>
    </ActionForm>
  );
}

export function SetupForm() {
  const [error, action, pending] = useActionState(setupFirstAdmin, null);
  return (
    <ActionForm action={action} className="card w-full max-w-sm space-y-4">
      <div>
        <Logo height={40} className="mb-4" />
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
