import type { Prisma } from "@prisma/client";
import { madridTime } from "./clockRules";
import { addDays } from "./domain";

export type AuditFilters = { q?: string; entidad?: string; quien?: string; desde?: string; hasta?: string; id?: string };

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Filtro de Prisma a partir de los parámetros de la página (días completos en hora de Madrid). */
export function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.q?.trim()) and.push({ OR: [{ summary: { contains: f.q.trim(), mode: "insensitive" } }, { actor: { contains: f.q.trim(), mode: "insensitive" } }] });
  if (f.entidad) and.push({ entity: f.entidad });
  if (f.quien) and.push({ actor: f.quien });
  if (f.id) and.push({ entityId: f.id });
  if (isDate(f.desde)) and.push({ at: { gte: madridTime(f.desde!, "00:00") } });
  if (isDate(f.hasta)) and.push({ at: { lt: madridTime(addDays(f.hasta!, 1), "00:00") } });
  return and.length ? { AND: and } : {};
}

export const fmtAt = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
