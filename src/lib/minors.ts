import { getCompany } from "./contracts";
import { db } from "./db";
import { formatDate, today } from "./domain";

/**
 * Menores de edad: con 16 o 17 años pueden trabajar, pero con la autorización firmada de su padre, madre o tutor
 * legal (nombre completo, DNI y firma). Hasta tenerla, la app solo les deja firmarla. Con menos de 16 no pueden trabajar.
 */
export const MIN_AGE = 16;
export const ADULT_AGE = 18;

/** Años cumplidos en `day` (YYYY-MM-DD). */
export function ageOn(birthDate: string, day = today()) {
  const [y, m, d] = birthDate.split("-").map(Number);
  const [ty, tm, td] = day.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export type MinorStatus = { age: number; state: "too-young" | "needs-tutor" | "authorized"; contract?: { id: string; signerName: string | null; signedAt: Date | null; data: unknown } };

/** null si es mayor de edad o no sabemos su fecha de nacimiento. */
export async function minorStatus(w: { id: string; birthDate: string | null }): Promise<MinorStatus | null> {
  if (!w.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(w.birthDate)) return null;
  const age = ageOn(w.birthDate);
  if (age >= ADULT_AGE) return null;
  if (age < MIN_AGE) return { age, state: "too-young" };
  const contract = await db.contract.findFirst({
    where: { workerId: w.id, kind: "TUTOR", signedAt: { not: null } },
    orderBy: { signedAt: "desc" },
    select: { id: true, signerName: true, signedAt: true, data: true },
  });
  return contract ? { age, state: "authorized", contract } : { age, state: "needs-tutor" };
}

export { TUTOR_RELATIONS } from "./tutorRelations";

/** Texto de la autorización que firma el padre, madre o tutor. */
export async function tutorText(
  w: { name: string; dni: string | null; birthDate: string },
  t: { name: string; dni: string; relation: string },
) {
  const company = await getCompany();
  const empresa = company.name ? `${company.name}${company.cif ? ` (CIF ${company.cif})` : ""}` : "Artigot Catering";
  return [
    `${t.name}, con DNI/NIE ${t.dni}, en calidad de ${t.relation.toLowerCase()} de ${w.name}${w.dni ? `, con DNI/NIE ${w.dni}` : ""}, nacido/a el ${formatDate(w.birthDate, { long: true })}, menor de edad,`,
    "",
    `AUTORIZO a ${w.name} a trabajar para ${empresa} como personal de servicio en eventos (camarero/a o mozo/a), según el artículo 7 del Estatuto de los Trabajadores, y a darse de alta y firmar los documentos necesarios para ello.`,
    "",
    "Declaro que conozco el tipo de trabajo (servicios de catering en bodas y eventos, que pueden ser en fin de semana) y que la persona menor no realizará trabajos nocturnos ni horas extraordinarias prohibidos para menores de 18 años.",
    "",
    "Esta autorización vale hasta que cumpla 18 años, salvo que la revoque por escrito.",
  ].join("\n");
}
