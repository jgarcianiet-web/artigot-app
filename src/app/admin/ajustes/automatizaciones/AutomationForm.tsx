"use client";

import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { WEEKDAY_LABEL, type AutomationSettings } from "@/lib/automation";
import { EVENT_TYPE_LABEL, EVENT_TYPES } from "@/lib/domain";
import { saveAutomationAction, sendA3EmailNow } from "./actions";

// La semana empieza en lunes
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function AutomationForm({ s, mail }: { s: AutomationSettings; mail: boolean }) {
  const [msg, run] = useActionState(saveAutomationAction, null);
  return (
    <ActionForm action={run} className="max-w-3xl space-y-4">
      <section className="card space-y-3">
        <h2>1. Convocatoria automática</h2>
        <p className="text-sm text-stone-600">
          Cada evento puede convocarse solo unos días antes: la app convoca a los mejor puntuados que estén libres (primero a quien ha dicho en el sondeo
          que puede) hasta cubrir el personal necesario y avisa a RRHH con el resumen. Se elige en cada evento; aquí, lo que sale marcado en los nuevos.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="convokeDefaultOn" value="1" defaultChecked={s.convoke.defaultOn} className="size-4" />
          Activada por defecto en los eventos nuevos
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="block text-sm">Días antes del evento<input name="convokeDays" type="number" min={0} max={60} className="input mt-1 w-28" defaultValue={s.convoke.days} /></label>
          <label className="block text-sm">A partir de las<input name="convokeHour" type="time" className="input mt-1 w-32" defaultValue={s.convoke.hour} /></label>
        </div>
      </section>

      <section className="card space-y-3">
        <h2>2. Disponibilidad cada semana</h2>
        <p className="text-sm text-stone-600">
          Un día a la semana se pregunta a todo el personal qué días puede trabajar la semana siguiente (un sondeo automático). Quien dice «puedo» va
          primero en las convocatorias de ese día; quien dice «no puedo» no se convoca.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="availEnabled" value="1" defaultChecked={s.availability.enabled} className="size-4" />
          Preguntar la disponibilidad cada semana
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="block text-sm">
            Enviar los
            <select name="availWeekday" className="input mt-1 w-36" defaultValue={s.availability.weekday}>
              {WEEK.map((d) => <option key={d} value={d}>{WEEKDAY_LABEL[d].toLowerCase()}</option>)}
            </select>
          </label>
          <label className="block text-sm">A las<input name="availHour" type="time" className="input mt-1 w-32" defaultValue={s.availability.hour} /></label>
        </div>
        <fieldset className="text-sm">
          <legend className="mb-1">Días de la semana siguiente por los que se pregunta</legend>
          <div className="flex flex-wrap gap-3">
            {WEEK.map((d) => (
              <label key={d} className="flex items-center gap-1.5">
                <input type="checkbox" name="availDays" value={d} defaultChecked={s.availability.days.includes(d)} className="size-4" /> {WEEKDAY_LABEL[d]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="availRemind" value="1" defaultChecked={s.availability.remind} className="size-4" />
          Al día siguiente, recordárselo a quien no ha contestado
        </label>
      </section>

      <section className="card space-y-3">
        <h2>3. Personal según los invitados</h2>
        <p className="text-sm text-stone-600">
          Al poner los invitados en un evento se calcula el personal necesario: <strong>invitados por cada persona</strong> de cada puesto (0 = no se
          calcula). Se redondea hacia arriba y se puede cambiar a mano en cada evento.
        </p>
        <div className="overflow-x-auto">
          <table className="table text-sm">
            <thead>
              <tr><th>Tipo</th><th>1 camarero cada</th><th>1 maître cada</th><th>Mínimo de maîtres</th><th>1 mozo cada</th></tr>
            </thead>
            <tbody>
              {EVENT_TYPES.map((t) => (
                <tr key={t}>
                  <td className="font-medium">{EVENT_TYPE_LABEL[t]}</td>
                  {(["camareros", "maitres", "minMaitres", "mozos"] as const).map((k) => (
                    <td key={k}>
                      <input name={`r_${t}_${k}`} type="number" min={0} className="input h-9 w-24" defaultValue={s.ratios[t][k]} aria-label={`${EVENT_TYPE_LABEL[t]}: ${k}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <h2>4. Email diario con los Excel de A3</h2>
        <p className="text-sm text-stone-600">
          Cada día, a la hora indicada, RRHH recibe por email los Excel listos para importar en A3: el «MA - Alta sucesiva» de quien trabaja mañana, el alta
          masiva (con imputación, banco de pago y AMP) de quien es nuevo en A3 —se le da el siguiente código— y el «MB - Baja» de las bajas de hoy. Quien
          trabaja mañana sin los datos completos sale en el email para completarlo.
        </p>
        {!mail && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">El envío de emails no está configurado: hasta que lo esté, no se envía.</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="a3Enabled" value="1" defaultChecked={s.a3Email.enabled} className="size-4" />
          Enviar el email cada día
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="block text-sm">A las<input name="a3Hour" type="time" className="input mt-1 w-32" defaultValue={s.a3Email.hour} /></label>
          <label className="min-w-72 flex-1 text-sm">
            Enviar a (separados por comas)
            <input name="a3To" className="input mt-1" defaultValue={s.a3Email.to} placeholder="Vacío: a todos los usuarios de RRHH" />
          </label>
        </div>
      </section>

      {msg && <p className="text-sm">{msg}</p>}
      <SubmitButton>Guardar</SubmitButton>
    </ActionForm>
  );
}

export function SendA3Now({ mail }: { mail: boolean }) {
  const [msg, run] = useActionState(sendA3EmailNow, null);
  if (!mail) return null;
  return (
    <ActionForm action={run} className="card max-w-3xl space-y-2">
      <p className="text-sm text-stone-600">¿Lo quieres ya? Envía ahora el email de A3 de mañana (el automático de hoy ya no se repetirá).</p>
      {msg && <p className="text-sm">{msg}</p>}
      <SubmitButton className="btn">Enviar ahora el email de A3</SubmitButton>
    </ActionForm>
  );
}
