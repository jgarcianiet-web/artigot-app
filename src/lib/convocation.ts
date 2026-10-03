import { db } from "./db";

/**
 * Qué pasa con las convocatorias que nadie contesta: recordatorio al trabajador, aviso a RRHH y, si
 * sigue sin contestar, se da por rechazada y (si el evento tiene la reposición automática) se
 * convoca al siguiente mejor puntuado del mismo puesto. Se cuenta desde la última convocatoria.
 */
export type ConvocationSettings = {
  /** Horas sin contestar hasta recordárselo al trabajador */
  remindHours: number;
  /** Horas sin contestar hasta avisar a RRHH */
  rrhhHours: number;
  /** Pasar al siguiente si no contesta */
  replace: boolean;
  /** Horas sin contestar hasta pasar al siguiente */
  replaceHours: number;
};

export const CONVOCATION_DEFAULTS: ConvocationSettings = { remindHours: 6, rrhhHours: 12, replace: true, replaceHours: 24 };

export async function getConvocationSettings(): Promise<ConvocationSettings> {
  const row = await db.setting.findUnique({ where: { key: "convocatorias" } });
  return { ...CONVOCATION_DEFAULTS, ...((row?.value ?? {}) as Partial<ConvocationSettings>) };
}

export async function saveConvocationSettings(value: ConvocationSettings) {
  await db.setting.upsert({ where: { key: "convocatorias" }, create: { key: "convocatorias", value }, update: { value } });
}
