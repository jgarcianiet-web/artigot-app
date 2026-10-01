import { db } from "./db";
import { addDays, today } from "./domain";
import { IDENTITY_DOCS } from "./identityDocs";
import { getPrivacy } from "./privacy";

/**
 * Qué le falta a cada persona para tener la ficha completa:
 * protección de datos firmada (versión vigente), DNI, nº de la Seguridad Social e IBAN, cada uno con su documento.
 */

const LABEL: Record<string, string> = { dni: "DNI", nss: "nº de la Seguridad Social", iban: "IBAN" };
const DOC_NAME: Record<string, string> = { DNI: "foto del DNI", NSS: "tarjeta de la Seguridad Social", CUENTA: "certificado de la cuenta" };

export type Incomplete = { id: string; name: string; phone: string; missing: string[]; upcoming: boolean };

export async function incompleteWorkers(workerIds?: string[]): Promise<Incomplete[]> {
  const t = today();
  const { version } = await getPrivacy();
  const workers = await db.worker.findMany({
    where: { active: true, ...(workerIds && { id: { in: workerIds } }) },
    select: {
      id: true, name: true, phone: true, dni: true, nss: true, iban: true,
      documents: { where: { type: { in: IDENTITY_DOCS.map((d) => d.type) } }, select: { type: true } },
      contracts: { where: { kind: "RGPD", version, signedAt: { not: null } }, select: { id: true }, take: 1 },
      assignments: { where: { status: { in: ["CONVOCADO", "CONFIRMADO"] }, event: { date: { gte: t, lte: addDays(t, 7) } } }, select: { id: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  const out: Incomplete[] = [];
  for (const w of workers) {
    const missing: string[] = [];
    if (!w.contracts.length) missing.push("firma de protección de datos");
    const docs = new Set(w.documents.map((d) => d.type));
    for (const d of IDENTITY_DOCS) {
      if (!w[d.field]) missing.push(LABEL[d.field]);
      else if (!docs.has(d.type)) missing.push(DOC_NAME[d.type]);
    }
    if (missing.length) out.push({ id: w.id, name: w.name, phone: w.phone, missing, upcoming: w.assignments.length > 0 });
  }
  return out;
}

export const missingText = (m: string[]) => (m.length <= 2 ? m.join(" y ") : `${m.slice(0, -1).join(", ")} y ${m.at(-1)}`);
