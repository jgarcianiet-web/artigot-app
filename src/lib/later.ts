import { after } from "next/server";

/**
 * Trabajo que no debe retrasar la respuesta (avisos, emails…). Dentro de una petición se hace al
 * terminarla (after); fuera de una petición (tareas automáticas cada pocos minutos) se hace ya.
 */
export function later(fn: () => Promise<unknown>) {
  try {
    after(fn);
  } catch {
    fn().catch((e) => console.error("tarea en segundo plano", e));
  }
}
