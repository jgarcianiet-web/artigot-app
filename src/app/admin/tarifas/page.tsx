import { saveRates } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { db } from "@/lib/db";
import { EVENT_TYPE_LABEL, EVENT_TYPES, ROLE_PLURAL, ROLES } from "@/lib/domain";

export default async function Rates() {
  const rates = new Map((await db.rate.findMany()).map((r) => [r.role, r]));
  return (
    <div className="space-y-4">
      <h1>Tarifas</h1>
      <form action={saveRates} className="card max-w-4xl space-y-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Puesto</th>
              <th>€ / hora (general)</th>
              {EVENT_TYPES.map((t) => <th key={t}>€ / hora {EVENT_TYPE_LABEL[t].toLowerCase()}</th>)}
              <th>Mínimo de horas</th>
              <th>Plus por evento (€)</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r}>
                <td className="font-medium">{ROLE_PLURAL[r]}</td>
                <td><input name={`rate_${r}`} inputMode="decimal" defaultValue={rates.get(r)?.hourlyRate ?? 0} className="input w-24" aria-label={`€/hora general de ${ROLE_PLURAL[r]}`} /></td>
                {EVENT_TYPES.map((t) => (
                  <td key={t}>
                    <input
                      name={`type_${r}_${t}`}
                      inputMode="decimal"
                      defaultValue={(rates.get(r)?.typeRates as Record<string, number> | null)?.[t] ?? ""}
                      placeholder="general"
                      className="input w-24"
                      aria-label={`€/hora de ${ROLE_PLURAL[r]} en ${EVENT_TYPE_LABEL[t].toLowerCase()}`}
                    />
                  </td>
                ))}
                <td><input name={`min_${r}`} inputMode="decimal" defaultValue={rates.get(r)?.minHours ?? 0} className="input w-24" /></td>
                <td><input name={`bonus_${r}`} inputMode="decimal" defaultValue={rates.get(r)?.eventBonus ?? 0} className="input w-24" aria-label={`Plus por evento de ${ROLE_PLURAL[r]}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-stone-500">
          El precio por tipo de evento es opcional: si lo dejas vacío se usa el general. Si una persona tiene tarifa propia (en su ficha), se usa la suya.
          El mínimo se aplica si el trabajador ha estado menos horas (p. ej. una descarga de 2 h con mínimo de 4 h se paga como 4 h).
          El plus por evento se suma una vez por servicio a quien vaya con ese puesto (p. ej. +10 € al camarero responsable): cuenta en su nómina, en la remesa, en A3 y en el coste del evento.
        </p>
        <SubmitButton>Guardar tarifas</SubmitButton>
      </form>
    </div>
  );
}
