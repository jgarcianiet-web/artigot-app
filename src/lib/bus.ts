import { EventEmitter } from "node:events";

/**
 * Canal en memoria para el tiempo real (Server-Sent Events).
 * Suficiente con una sola instancia del servidor (el despliegue en Railway usa una).
 * Para escalar a varias instancias, sustituir por Postgres LISTEN/NOTIFY o Redis.
 */
const g = globalThis as unknown as { bus?: EventEmitter };
export const bus = g.bus ?? (g.bus = new EventEmitter().setMaxListeners(0));

export const chatChannel = (eventId: string) => `chat:${eventId}`;
