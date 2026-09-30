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

function saveQueue(q: QueuedClock[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* sin almacenamiento: no se puede guardar */
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function enqueueClock(item: Omit<QueuedClock, "id">) {
  const q = loadQueue().filter((x) => !(x.assignmentId === item.assignmentId && x.kind === item.kind));
  q.push({ ...item, id: `${item.assignmentId}-${item.kind}-${item.capturedAt}` });
  saveQueue(q);
}

export function removeQueued(id: string) {
  saveQueue(loadQueue().filter((x) => x.id !== id));
}
