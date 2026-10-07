/**
 * Cola de fichajes sin cobertura (en el propio móvil, localStorage).
 * Cada fichaje guarda la hora del móvil y la ubicación, y se envía al servidor al recuperar la señal.
 */
export type QueuedClock = {
  id: string;
  assignmentId: string;
  kind: "in" | "out";
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: number;
};

const KEY = "artigot-clock-queue";
export const QUEUE_EVENT = "artigot-clock-queue";

export function loadQueue(): QueuedClock[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Guarda la cola y comprueba que se ha guardado de verdad (sin espacio o en modo privado puede fallar). */
function saveQueue(q: QueuedClock[]) {
  let ok = false;
  try {
    const json = JSON.stringify(q);
    localStorage.setItem(KEY, json);
    ok = localStorage.getItem(KEY) === json;
  } catch {
    ok = false;
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
  return ok;
}

/** Devuelve false si el móvil no ha podido guardar el fichaje. */
export function enqueueClock(item: Omit<QueuedClock, "id">) {
  const q = loadQueue().filter((x) => !(x.assignmentId === item.assignmentId && x.kind === item.kind));
  const id = `${item.assignmentId}-${item.kind}-${item.capturedAt}`;
  q.push({ ...item, id });
  return saveQueue(q) && loadQueue().some((x) => x.id === id);
}

export function removeQueued(id: string) {
  saveQueue(loadQueue().filter((x) => x.id !== id));
}
