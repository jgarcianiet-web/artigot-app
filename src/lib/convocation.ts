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

/** Otro servicio confirmado ese mismo día (no se puede estar en dos eventos a la vez). */
export async function sameDayBooking(
  tx: Pick<typeof db, "assignment">,
  a: { id: string; workerId: string; event: { date: string } },
) {
  return tx.assignment.findFirst({
    where: { workerId: a.workerId, id: { not: a.id }, status: "CONFIRMADO", event: { date: a.event.date } },
    select: { event: { select: { name: true } } },
  });
}

/** Para la ficha del evento: ¿puede aceptar? Si no, por qué. */
export async function acceptBlock(a: { id: string; workerId: string; event: { date: string } }) {
  const other = await sameDayBooking(db, a);
  if (other) return `Ya estás confirmado ese día en ${other.event.name}. Si puedes hacer los dos, habla con RRHH.`;
  if ((await pendingReviews(a.workerId)).some((p) => p.overdue)) return "Antes de aceptar nuevas convocatorias, valora a tu equipo de los eventos anteriores.";
  return null;
}
