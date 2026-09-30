"use client";

/**
 * DNI, nº de la Seguridad Social e IBAN, cada uno con su documento adjunto (foto o PDF).
 * Se usa en la ficha de RRHH y en «Mis datos» de la app del personal.
 */
type Status = Record<string, { fileId: string | null; verified: boolean }>;

const FIELDS = [
  { field: "dni", type: "DNI", label: "DNI / NIE", doc: "Foto o PDF del DNI / NIE (por las dos caras)", inputMode: undefined },
  { field: "nss", type: "NSS", label: "Nº Seguridad Social", doc: "Foto o PDF de la tarjeta de la Seguridad Social", inputMode: "numeric" as const },
  { field: "iban", type: "CUENTA", label: "IBAN (cuenta para la nómina)", doc: "Certificado de titularidad de la cuenta (o captura de la app del banco con el IBAN y el titular)", inputMode: undefined },
] as const;

export function IdentityFields({
  values,
  docs,
  required,
  inputClass = "input mt-1",
}: {
  values: { dni: string | null; nss: string | null; iban: string | null };
  docs: Status;
  required: boolean;
  inputClass?: string;
}) {
  return (
    <div className="space-y-4 sm:col-span-2">
      {FIELDS.map((f) => {
        const d = docs[f.type];
        return (
          <div key={f.field} className="rounded-lg border border-stone-200 p-3">
            <label className="block text-sm">
              {f.label}
              <input name={f.field} className={inputClass} defaultValue={values[f.field] ?? ""} required={required} autoComplete="off" inputMode={f.inputMode} />
            </label>
            <label className="mt-2 block text-xs text-stone-600">
              {f.doc}
              {d ? (
                <span className="ml-1 text-emerald-700">
                  · ✓ ya adjuntado{d.verified ? " y revisado" : ""}
                  {d.fileId && <> (<a href={`/api/files/${d.fileId}`} target="_blank" className="underline">ver</a>)</>}. Adjunta otro solo si cambia el dato.
                </span>
              ) : (
                <span className="ml-1 font-medium text-red-700">· obligatorio</span>
              )}
              <input name={`doc_${f.field}`} type="file" accept="image/*,application/pdf" className="mt-1 block w-full text-sm" />
            </label>
            {f.field === "dni" && (
              <label className="mt-2 block text-xs text-stone-600">
                Caducidad del DNI / NIE (opcional, para avisar antes de que caduque)
                <input name="doc_dni_expires" type="date" className={inputClass} />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const IDENTITY_FILE_KEYS = ["doc_dni", "doc_nss", "doc_iban"];
