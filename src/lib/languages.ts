/** Idiomas del personal y de los candidatos: el nivel de inglés se pide siempre; los demás, en texto libre. */
export const ENGLISH_LEVELS = ["Ninguno", "Básico", "Intermedio", "Alto", "Nativo"] as const;
export type EnglishLevel = (typeof ENGLISH_LEVELS)[number];

export const isEnglishLevel = (v: unknown): v is EnglishLevel => (ENGLISH_LEVELS as readonly unknown[]).includes(v);

/** Niveles iguales o superiores a uno dado (para filtrar: «intermedio o más»). */
export const levelsFrom = (min: EnglishLevel) => ENGLISH_LEVELS.slice(ENGLISH_LEVELS.indexOf(min));

/** «Inglés intermedio · Francés básico» */
export function languagesText(w: { englishLevel: string | null; otherLanguages: string | null }) {
  return [w.englishLevel && (w.englishLevel === "Ninguno" ? "Sin inglés" : `Inglés ${w.englishLevel.toLowerCase()}`), w.otherLanguages].filter(Boolean).join(" · ");
}

export function parseLanguages(form: FormData) {
  const english = String(form.get("englishLevel") ?? "");
  return {
    englishLevel: isEnglishLevel(english) ? english : null,
    otherLanguages: String(form.get("otherLanguages") ?? "").trim().slice(0, 200) || null,
  };
}

/** ¿Tiene al menos ese nivel de inglés? */
export const meetsEnglish = (level: string | null | undefined, min: string | null | undefined) =>
  !min || (isEnglishLevel(level) && isEnglishLevel(min) && ENGLISH_LEVELS.indexOf(level) >= ENGLISH_LEVELS.indexOf(min));

/** «inglés intermedio o más» */
export const englishMinText = (min: string) => (min === "Nativo" ? "inglés nativo" : `inglés ${min.toLowerCase()} o más`);

/** Puestos a los que se aplica el inglés del evento (los mozos montan y descargan: no cuentan) */
export const ENGLISH_ROLES = ["MAITRE", "RESPONSABLE", "CAMARERO"];

type EnglishEvent = { englishMin: string | null; englishCount: number | null; needMaitres: number; needResponsables: number; needCamareros: number };

/**
 * Inglés del evento: cuántos lo necesitan (sin número = todos los camareros, responsables y maîtres) y cuántos de los
 * convocados y confirmados lo tienen. null si el evento no pide inglés.
 */
export function englishCoverage(ev: EnglishEvent, team: { role: string; status: string; englishLevel: string | null }[]) {
  if (!ev.englishMin) return null;
  const need = ev.englishCount ?? ev.needMaitres + ev.needResponsables + ev.needCamareros;
  const active = team.filter((a) => ENGLISH_ROLES.includes(a.role) && (a.status === "CONFIRMADO" || a.status === "CONVOCADO") && meetsEnglish(a.englishLevel, ev.englishMin));
  return { min: ev.englishMin, need, confirmed: active.filter((a) => a.status === "CONFIRMADO").length, pending: active.filter((a) => a.status === "CONVOCADO").length, all: ev.englishCount == null };
}
