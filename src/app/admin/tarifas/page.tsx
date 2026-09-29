import { saveRates } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { db } from "@/lib/db";
import { ROLE_PLURAL, ROLES } from "@/lib/domain";

export default async function Rates() {
  const rates = new Map((await db.rate.findMany()).map((r) => [r.role, r]));
  return (
    <div className="space-y-4">
      <h1>Tarifas</h1>
      <form action={saveRates} className="card max-w-xl space-y-4">
        <table className="table">
          <thead>
            <tr>
              <th>Puesto</th>
              <th>€ / hora</th>
              <th>Mínimo de horas por servicio</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r}>
                <td className="font-medium">{ROLE_PLURAL[r]}</td>
                <td><input name={`rate_${r}`} inputMode="decimal" defaultValue={rates.get(r)?.hourlyRate ?? 0} className="input w-24" /></td>
                <td><input name={`min_${r}`} inputMode="decimal" defaultValue={rates.get(r)?.minHours ?? 0} className="input w-24" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-stone-500">
          El mínimo se aplica si el trabajador ha estado menos horas (p. ej. una descarga de 2 h con mínimo de 4 h se paga como 4 h).
        </p>
        <SubmitButton>Guardar tarifas</SubmitButton>
      </form>
    </div>
  );
}
