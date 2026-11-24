/** Preguntas de manejo de bandeja del formulario «Trabaja con nosotros» (las respuestas pasan a la ficha al contratarle). */
export const TRAY_QUESTIONS = [
  { name: "trayOneHand", label: "¿Sabes llevar la bandeja con una sola mano?", options: ["Sí, con soltura", "Sí, pero me falta práctica", "No"] },
  { name: "trayGlasses", label: "¿Cuántas copas llenas eres capaz de llevar en una bandeja?", options: ["Más de 12", "Entre 6 y 12", "Menos de 6", "Nunca lo he hecho"] },
  { name: "traySilver", label: "¿Sabes servir a la inglesa (con pinzas, desde la fuente o bandeja al plato)?", options: ["Sí", "Un poco", "No"] },
] as const;

export type TrayKey = (typeof TRAY_QUESTIONS)[number]["name"];

export function parseTray(form: FormData) {
  const out = {} as Record<TrayKey, string | null>;
  for (const q of TRAY_QUESTIONS) {
    const v = String(form.get(q.name) ?? "");
    out[q.name] = (q.options as readonly string[]).includes(v) ? v : null;
  }
  return out;
}

/** «Una mano: sí, con soltura · Copas: entre 6 y 12 · A la inglesa: un poco» */
export function trayText(c: Partial<Record<TrayKey, string | null>>) {
  const parts = [
    c.trayOneHand && `una mano: ${c.trayOneHand.toLowerCase()}`,
    c.trayGlasses && `copas: ${c.trayGlasses.toLowerCase()}`,
    c.traySilver && `a la inglesa: ${c.traySilver.toLowerCase()}`,
  ].filter(Boolean);
  return parts.length ? `Bandeja — ${parts.join(" · ")}` : "";
}
