import { Prisma } from "@prisma/client";
import { auditAdmin } from "./audit";
import { db } from "./db";

/**
 * Une dos fichas de la misma persona (p. ej. el mismo DNI importado con el nombre escrito distinto).
 * Se queda la ficha elegida; de la otra se pasan sus servicios, fichajes, documentos, altas, pagos,
 * mensajes… y los datos que a la que se queda le falten. Después se borra la repetida.
 * Si las dos tienen lo mismo (p. ej. las dos convocadas al mismo evento) manda lo de la que se queda.
 */

/** Tablas que apuntan a un trabajador (sacadas del esquema: si se añade una, se une sola). */
function workerRelations() {
  const out: { table: string; column: string; nullable: boolean; uniques: string[][] }[] = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    for (const f of m.fields) {
      if (f.type !== "Worker" || !f.relationFromFields?.length) continue;
      const column = f.relationFromFields[0];
      const scalar = m.fields.find((x) => x.name === column)!;
      const uniques = [...m.uniqueFields.map((u) => [...u]), ...m.fields.filter((x) => x.isUnique).map((x) => [x.name])].filter((u) => u.includes(column));
      out.push({ table: m.dbName ?? m.name, column, nullable: !scalar.isRequired, uniques });
    }
  }
  return out;
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

export async function mergeWorkers(keepId: string, dupId: string, by: string) {
  if (keepId === dupId) throw new Error("Elige dos fichas distintas.");
  return db.$transaction(
    async (tx) => {
      const [keep, dup] = await Promise.all([tx.worker.findUnique({ where: { id: keepId } }), tx.worker.findUnique({ where: { id: dupId } })]);
      if (!keep || !dup) throw new Error("Alguna de las dos fichas ya no existe.");

      // 1. Todo lo que cuelga de la repetida pasa a la que se queda
      for (const r of workerRelations()) {
        for (const u of r.uniques) {
          const others = u.filter((c) => c !== r.column);
          if (!others.length) {
            // Único por persona (p. ej. candidatura): si la que se queda ya tiene, se suelta el de la repetida
            const has = await tx.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${q(r.table)} WHERE ${q(r.column)} = $1 LIMIT 1`, keepId);
            if (has.length) {
              await tx.$executeRawUnsafe(
                r.nullable ? `UPDATE ${q(r.table)} SET ${q(r.column)} = NULL WHERE ${q(r.column)} = $1` : `DELETE FROM ${q(r.table)} WHERE ${q(r.column)} = $1`,
                dupId,
              );
            }
            continue;
          }
          // Lo que ya tiene la que se queda (mismo evento, mismo día…) manda: se quita el de la repetida
          const same = others.map((c) => `k.${q(c)} IS NOT DISTINCT FROM d.${q(c)}`).join(" AND ");
          await tx.$executeRawUnsafe(
            `DELETE FROM ${q(r.table)} d WHERE d.${q(r.column)} = $1 AND EXISTS (SELECT 1 FROM ${q(r.table)} k WHERE k.${q(r.column)} = $2 AND ${same})`,
            dupId,
            keepId,
          );
        }
        await tx.$executeRawUnsafe(`UPDATE ${q(r.table)} SET ${q(r.column)} = $1 WHERE ${q(r.column)} = $2`, keepId, dupId);
      }
      // Lecturas del chat y registro de cambios
      await tx.$executeRawUnsafe(
        `DELETE FROM "ChatRead" d WHERE d.reader = $1 AND EXISTS (SELECT 1 FROM "ChatRead" k WHERE k.reader = $2 AND k."eventId" = d."eventId")`,
        `w:${dupId}`,
        `w:${keepId}`,
      );
      await tx.$executeRawUnsafe(`UPDATE "ChatRead" SET reader = $1 WHERE reader = $2`, `w:${keepId}`, `w:${dupId}`);
      await tx.$executeRawUnsafe(`UPDATE "AuditLog" SET "entityId" = $1 WHERE "entityId" = $2`, keepId, dupId);

      // 2. Datos que le falten a la que se queda (los únicos —teléfono, foto— se sueltan antes de la repetida)
      const fill: Record<string, unknown> = {};
      const skip = new Set(["id", "name", "accessCode", "sessionVersion", "failedLogins", "createdAt", "updatedAt", "rating", "active", "role", "roles", "customRates", "noClock"]);
      for (const [k, v] of Object.entries(dup)) {
        if (skip.has(k) || empty(v)) continue;
        if (empty((keep as Record<string, unknown>)[k])) fill[k] = v;
      }
      if (fill.phoneKey && !fill.phone) delete fill.phoneKey;
      if (fill.phone && !fill.phoneKey) delete fill.phone;
      const roles = [...new Set([...keep.roles, keep.role, ...dup.roles, dup.role])];
      const customRates = { ...((dup.customRates as object | null) ?? {}), ...((keep.customRates as object | null) ?? {}) };
      await tx.worker.update({ where: { id: dupId }, data: { phone: null, phoneKey: null, photoFileId: null } });
      await tx.worker.update({
        where: { id: keepId },
        data: {
          ...(fill as Prisma.WorkerUpdateInput),
          roles,
          active: keep.active || dup.active,
          ...(Object.keys(customRates).length && { customRates }),
        },
      });
      await tx.worker.delete({ where: { id: dupId } });
      await auditAdmin(by, "Trabajador", "Fichas unidas", `«${dup.name}» se ha unido a «${keep.name}»${keep.dni ? ` (DNI ${keep.dni})` : ""}`, { entityId: keepId });
      return { kept: keep.name, removed: dup.name };
    },
    { timeout: 60_000 },
  );
}

/** Personas con el mismo DNI (fichas repetidas). */
export async function duplicateGroups() {
  const workers = await db.worker.findMany({
    where: { dni: { not: null } },
    select: {
      id: true, name: true, dni: true, phone: true, email: true, active: true, createdAt: true, a3Code: true, iban: true, nss: true,
      _count: { select: { assignments: true, documents: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const by = new Map<string, typeof workers>();
  for (const w of workers) {
    const k = w.dni!.toUpperCase().replace(/[^A-Z0-9]/g, "");
    by.set(k, [...(by.get(k) ?? []), w]);
  }
  return [...by.entries()].filter(([, ws]) => ws.length > 1).map(([dni, ws]) => ({ dni, workers: ws }));
}
