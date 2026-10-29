/**
 * Franjas de disponibilidad: cuando alguien dice que puede trabajar un día elige si puede todo el día, solo por la
 * mañana (hasta las 15:00) o solo por la tarde (desde las 15:00). Un evento es de mañana o de tarde según su hora de
 * inicio.
 */

export const SLOTS = ["DIA", "MANANA", "TARDE"] as const;
export type Slot = (typeof SLOTS)[number];
/** Respuesta a «¿puedes trabajar este día?»: una franja o NO */
export type DayAnswer = Slot | "NO";

export const SPLIT_TIME = "15:00";
export const SLOT_LABEL: Record<Slot, string> = { DIA: "Todo el día", MANANA: "Mañana (hasta las 15:00)", TARDE: "Tarde (desde las 15:00)" };
export const SLOT_SHORT: Record<Slot, string> = { DIA: "todo el día", MANANA: "solo mañana", TARDE: "solo tarde" };

export const isSlot = (v: unknown): v is Slot => SLOTS.includes(v as Slot);
export const isDayAnswer = (v: unknown): v is DayAnswer => v === "NO" || isSlot(v);

/** Franja del evento según su hora de inicio. */
export const eventHalf = (startTime: string): Exclude<Slot, "DIA"> => (startTime < SPLIT_TIME ? "MANANA" : "TARDE");

/** Si solo puede una franja y el evento es de la otra. */
export const slotConflict = (only: string | null | undefined, startTime: string) => !!only && only !== "DIA" && only !== eventHalf(startTime);
