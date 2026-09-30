"use client";

import { ActionForm } from "@/components/client";
import { useActionState, useRef } from "react";
import { changeMyPassword, createAdminUser, resetAdminPassword } from "@/app/actions";

export function NewUserForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [error, action, pending] = useActionState(async (prev: string | null, form: FormData) => {
    const r = await createAdminUser(prev, form);
    if (!r) ref.current?.reset();
    return r;
  }, null);
  return (
    <ActionForm ref={ref} action={action} className="card space-y-3">
      <h2>Añadir usuario de RRHH</h2>
      <input name="name" className="input" placeholder="Nombre" required />
      <input name="email" type="email" className="input" placeholder="Email" required autoComplete="off" />
      <input name="password" type="text" minLength={8} className="input" placeholder="Contraseña inicial (mín. 8)" required autoComplete="off" />
      <p className="text-xs text-stone-500">Pásale la contraseña inicial y pídele que la cambie al entrar.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn btn-primary" disabled={pending}>Añadir</button>
    </ActionForm>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const [msg, action, pending] = useActionState(resetAdminPassword.bind(null, id), null);
  return (
    <ActionForm action={action} className="flex flex-wrap items-center gap-2">
      <input name="password" type="text" minLength={8} className="input w-44" placeholder="Nueva contraseña" required autoComplete="off" />
      <button className="btn btn-sm" disabled={pending}>Cambiar</button>
      {msg && <span className="text-xs text-stone-600">{msg}</span>}
    </ActionForm>
  );
}

export function ChangeMyPasswordForm() {
  const [msg, action, pending] = useActionState(changeMyPassword, null);
  return (
    <ActionForm action={action} className="card space-y-3">
      <h2>Cambiar mi contraseña</h2>
      <input name="current" type="password" className="input" placeholder="Contraseña actual" required autoComplete="current-password" />
      <input name="password" type="password" minLength={8} className="input" placeholder="Nueva contraseña (mín. 8)" required autoComplete="new-password" />
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
      <button className="btn" disabled={pending}>Cambiar contraseña</button>
    </ActionForm>
  );
}
