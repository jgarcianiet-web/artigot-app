"use client";

import { createContext, type FormHTMLAttributes, type Ref, useContext, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

const PendingContext = createContext(false);

/**
 * Formulario que envía a una acción sin que React lo vacíe al terminar: si el servidor
 * devuelve un error, lo escrito se conserva para corregirlo.
 */
export function ActionForm({
  action,
  children,
  ...props
}: { action: (form: FormData) => void; ref?: Ref<HTMLFormElement> } & Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit">) {
  const [pending, start] = useTransition();
  return (
    <PendingContext.Provider value={pending}>
      <form
        {...props}
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const data = new FormData(e.currentTarget, submitter);
          start(() => action(data));
        }}
      >
        {children}
      </form>
    </PendingContext.Provider>
  );
}

/** ¿Hay un envío en curso en el formulario que contiene este componente? */
export function useSubmitting() {
  return useFormStatus().pending || useContext(PendingContext);
}

export function SubmitButton({ children, className = "btn btn-primary" }: { children: React.ReactNode; className?: string }) {
  const pending = useSubmitting();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Guardando…" : children}
    </button>
  );
}

/** Botón de envío que pide confirmación antes de ejecutar la acción. */
export function ConfirmButton({
  children,
  message,
  className = "btn btn-danger",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copiar", className = "btn btn-sm" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "¡Copiado!" : label}
    </button>
  );
}

/** Marca/desmarca todas las casillas con el nombre dado dentro del mismo formulario. */
export function SelectAll({ name }: { name: string }) {
  return (
    <input
      type="checkbox"
      className="size-4"
      aria-label="Seleccionar todos"
      onChange={(e) => {
        e.currentTarget.form
          ?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)
          .forEach((c) => (c.checked = e.currentTarget.checked));
      }}
    />
  );
}
