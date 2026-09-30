import { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Registro de cambios: quién hizo qué y cuándo (horas, pagos, altas, datos del personal, ajustes…).
 * Nunca interrumpe la acción principal: si falla, solo se anota en el log del servidor.
 */

export type ActorKind = "RRHH" | "Trabajador" | "Sistema";

export async function audit(
  actor: string,
  actorKind: ActorKind,
  entity: string,
  action: string,
  summary: string,
  opts: { entityId?: string | null; data?: unknown } = {},
) {
  try {
    await db.auditLog.create({
      data: {
        actor,
        actorKind,
        entity,
        action,
        summary: summary.slice(0, 1000),
        entityId: opts.entityId ?? null,
        data: opts.data === undefined ? undefined : (JSON.parse(JSON.stringify(opts.data)) as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    console.error("registro de cambios", e);
  }
}

/** Atajo para acciones de RRHH. */
export const auditAdmin = (by: string, entity: string, action: string, summary: string, opts?: { entityId?: string | null; data?: unknown }) =>
  audit(by, "RRHH", entity, action, summary, opts);

const SENSITIVE = new Set(["iban"]);
const mask = (k: string, v: unknown) => {
  if (v == null || v === "") return "—";
  const s = String(v);
  return SENSITIVE.has(k) && s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
};

/** Cambios entre dos versiones de un registro: «IBAN: ES91…1332 → ES79…6789; Teléfono: … → …». */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown>, labels: Record<string, string>) {
  const changes: string[] = [];
  const data: Record<string, [unknown, unknown]> = {};
  for (const [k, label] of Object.entries(labels)) {
    const a = before?.[k] ?? null;
    const b = after[k] ?? null;
    const same = Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : String(a ?? "") === String(b ?? "");
    if (same) continue;
    changes.push(`${label}: ${mask(k, Array.isArray(a) ? a.join(", ") : a)} → ${mask(k, Array.isArray(b) ? b.join(", ") : b)}`);
    data[k] = [SENSITIVE.has(k) ? mask(k, a) : a, SENSITIVE.has(k) ? mask(k, b) : b];
  }
  return { text: changes.join("; "), data, changed: changes.length > 0 };
}
