import { db } from "./db";
import { pendingReviews } from "./reviews";

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

/** Otros servicios ese mismo día (convocado o confirmado): se puede ir a los dos (mañana y tarde), pero se avisa. */
export async function sameDayBookings(a: { id: string; workerId: string; event: { date: string } }) {
  const list = await db.assignment.findMany({
    where: { workerId: a.workerId, id: { not: a.id }, status: { in: ["CONVOCADO", "CONFIRMADO"] }, event: { date: a.event.date } },
    select: { status: true, event: { select: { name: true, startTime: true, endTime: true } } },
  });
  return list.map((o) => `${o.event.name} (${o.event.startTime}${o.event.endTime ? `–${o.event.endTime}` : ""}${o.status === "CONVOCADO" ? ", pendiente de contestar" : ""})`);
}

/** Para la ficha del evento: ¿puede aceptar? (solo lo impiden las valoraciones atrasadas) */
export async function acceptBlock(a: { workerId: string }) {
  if ((await pendingReviews(a.workerId)).some((p) => p.overdue)) return "Antes de aceptar nuevas convocatorias, valora a tu equipo de los eventos anteriores.";
  return null;
}
