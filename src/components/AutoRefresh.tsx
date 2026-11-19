"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Tras escribir en un formulario, no se recarga en este tiempo (para no molestar mientras se rellena) */
const TYPING_PAUSE_MS = 2 * 60_000;
/** Al volver a la pestaña o a la app, se recarga si hace más de esto de la última vez */
const ON_RETURN_MS = 10_000;

/**
 * Vuelve a cargar los datos de la página cada `seconds` mientras está visible, y al volver a ella (otra pestaña,
 * el móvil bloqueado…). No lo hace mientras se está escribiendo en un formulario.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    let typedAt = 0;
    const busy = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return true;
      if (document.querySelector("dialog[open]")) return true;
      return Date.now() - typedAt < TYPING_PAUSE_MS;
    };
    const refresh = () => {
      if (document.visibilityState !== "visible" || busy()) return;
      last = Date.now();
      router.refresh();
    };
    const onInput = () => (typedAt = Date.now());
    // Al enviar el formulario ya no hay nada a medias
    const onSubmit = () => (typedAt = 0);
    const onReturn = () => {
      if (document.visibilityState === "visible" && Date.now() - last > ON_RETURN_MS) refresh();
    };
    const id = setInterval(refresh, seconds * 1000);
    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearInterval(id);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [router, seconds]);
  return null;
}
