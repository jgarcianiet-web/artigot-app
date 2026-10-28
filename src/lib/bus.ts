import { EventEmitter } from "node:events";

/**
 * Canal en memoria para el tiempo real (Server-Sent Events).
 * Suficiente con una sola instancia del servidor (el despliegue en Railway usa una).
 * Para escalar a varias instancias, sustituir por Postgres LISTEN/NOTIFY o Redis.
 */
const g = globalThis as unknown as { bus?: EventEmitter };
export const bus = g.bus ?? (g.bus = new EventEmitter().setMaxListeners(0));

/** Chat de un evento: el general o el de uno de sus grupos (eventos grandes con «chat por grupos»). */
export const chatChannel = (eventId: string, groupId?: string | null) => (groupId ? `chat:${eventId}:${groupId}` : `chat:${eventId}`);
/** Avisa a la app de un trabajador de que han cambiado sus chats sin leer (para el número de «Chats»). */
export const workerInbox = (workerId: string) => `inbox:worker:${workerId}`;
