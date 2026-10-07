"use client";

import { createContext, type FormHTMLAttributes, type Ref, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

const PendingContext = createContext(false);

/**
 * Formulario que envía a una acción sin que React lo vacíe al terminar: si el servidor
 * devuelve un error, lo escrito se conserva para corregirlo.
 */
export function ActionForm({
  action,
  prepare,
  children,
  ...props
}: {
  action: (form: FormData) => void;
  /** Preparación previa al envío (p. ej. reducir fotos). */
  prepare?: (form: FormData) => Promise<void>;
  ref?: Ref<HTMLFormElement>;
} & Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit">) {
  const [pending, start] = useTransition();
  const [preparing, setPreparing] = useState(false);
  return (
    <PendingContext.Provider value={pending || preparing}>
      <form
        {...props}
        onSubmit={async (e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const data = new FormData(e.currentTarget, submitter);
          if (prepare) {
            setPreparing(true);
            try {
              await prepare(data);
            } finally {
              setPreparing(false);
            }
          }
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
        // Si hay una búsqueda, solo marca a los que se ven
        e.currentTarget.form
          ?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)
          .forEach((c) => {
            if (c.closest("tr")?.hidden) return;
            c.checked = e.currentTarget.checked;
          });
        e.currentTarget.form?.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    />
  );
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Buscador para una lista con casillas dentro de un formulario: filtra las filas (atributo
 * data-search) mientras se escribe, sin perder lo que ya está marcado, y cuenta los marcados.
 */
export function ListFilter({ name, placeholder = "Buscar por nombre, zona o teléfono…" }: { name: string; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<number | null>(null);
  const [checked, setChecked] = useState(0);
  const form = () => ref.current?.closest("form") ?? null;
  const count = () => setChecked(form()?.querySelectorAll(`input[name="${name}"]:checked`).length ?? 0);
  useEffect(() => {
    const f = form();
    count();
    f?.addEventListener("change", count);
    return () => f?.removeEventListener("change", count);
  });
  const apply = (value: string) => {
    setQ(value);
    const words = fold(value).split(/\s+/).filter(Boolean);
    let n = 0;
    form()?.querySelectorAll<HTMLTableRowElement>("tr[data-search]").forEach((tr) => {
      const hay = fold(tr.dataset.search ?? "");
      const ok = words.every((w) => hay.includes(w));
      tr.hidden = !ok;
      if (ok) n++;
    });
    setShown(words.length ? n : null);
  };
  return (
    <div ref={ref} className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => apply(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        placeholder={placeholder}
        aria-label="Buscar en la lista"
        className="input min-w-48 flex-1"
      />
      <span className="text-xs text-stone-500">
        {shown !== null && `${shown} encontrados · `}
        {checked} {checked === 1 ? "seleccionado" : "seleccionados"}
      </span>
    </div>
  );
}

export function PrintButton({ label = "🖨 Imprimir" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      {label}
    </button>
  );
}
