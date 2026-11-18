import { ENGLISH_LEVELS } from "@/lib/languages";

/** Nivel de inglés y otros idiomas (formulario de candidatos, «Mis datos» de la app y ficha de RRHH). */
export function LanguageFields({ english, other, required, inputClass = "input mt-1" }: { english?: string | null; other?: string | null; required?: boolean; inputClass?: string }) {
  return (
    <>
      <label className="block text-sm">
        Nivel de inglés
        <select name="englishLevel" className={inputClass} defaultValue={english ?? ""} required={required}>
          <option value="" disabled={required}>{required ? "Elige tu nivel…" : "—"}</option>
          {ENGLISH_LEVELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Otros idiomas <span className="text-stone-500">(opcional)</span>
        <input name="otherLanguages" className={inputClass} defaultValue={other ?? ""} maxLength={200} placeholder="P. ej. francés intermedio, alemán básico" />
      </label>
    </>
  );
}
