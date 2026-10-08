"use client";

import { Fragment, useActionState, useState } from "react";
import { saveWorker } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";
import { IDENTITY_FILE_KEYS, IdentityFields } from "@/components/IdentityFields";
import { shrinkFormImages } from "@/lib/image";
import { CONTRACT_LABEL, EVENT_TYPE_LABEL, EVENT_TYPES, OWN_RATE_ROLES, ROLE_LABEL, ROLES } from "@/lib/domain";

type Worker = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  roles: string[];
  rating: number;
  zone: string | null;
  notes: string | null;
  dni: string | null;
  nss: string | null;
  iban: string | null;
  birthDate: string | null;
  address: string | null;
  a3Code: string | null;
  a3Center?: string | null;
  customRates?: unknown;
  contractCode?: string | null;
  noClock?: boolean;
  monthlySalary?: number | null;
};

/** Tipo de contrato: extra (300) o fijo con nómina mensual (100 / 200), con o sin fichaje. */
function ContractFields({ worker }: { worker?: Worker }) {
  const [code, setCode] = useState(worker?.contractCode ?? "300");
  const fixed = code !== "300";
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="contractCode">Tipo de contrato</label>
        <select id="contractCode" name="contractCode" className="input" value={code} onChange={(e) => setCode(e.target.value)}>
          {Object.entries(CONTRACT_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {fixed && (
        <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="noClock" value="1" defaultChecked={!!worker?.noClock} className="mt-0.5 size-4 shrink-0" />
            <span>No ficha ni cuenta horas (p. ej. maître fijo). En los costes del evento cuenta con el horario previsto.</span>
          </label>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="monthlySalary">Nómina mensual (€, opcional)</label>
            <input id="monthlySalary" name="monthlySalary" inputMode="decimal" className="input" defaultValue={worker?.monthlySalary ?? ""} placeholder="1165,14" />
            <p className="mt-1 text-xs text-stone-500">Sus servicios se valoran con su tarifa; en «Horas y pagos → Fijos» se ve lo que lleva cada mes y lo que pasa de la nómina, que se le paga aparte.</p>
          </div>
        </div>
      )}
      <p className="text-xs text-stone-500">
        {fixed ? "Fijo: no entra en pagos por quincena, remesa, Excel de extras ni altas y bajas por actividad." : "Extra: cobra por horas y se le da de alta y de baja según los días que trabaja."}
      </p>
    </div>
  );
}

type DocStatus = Record<string, { fileId: string | null; verified: boolean }>;

export function WorkerForm({ worker, docs = {} }: { worker?: Worker; docs?: DocStatus }) {
  const [error, action] = useActionState(saveWorker, null);
  return (
    <ActionForm action={action} prepare={(f) => shrinkFormImages(f, IDENTITY_FILE_KEYS)} className="card max-w-2xl space-y-4">
      {worker && <input type="hidden" name="id" value={worker.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Nombre y apellidos</label>
          <input name="name" className="input" defaultValue={worker?.name} required />
        </div>
        <div>
          <label className="label">Teléfono (WhatsApp)</label>
          <input name="phone" type="tel" className="input" defaultValue={worker?.phone ?? ""} placeholder="600 123 456" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" defaultValue={worker?.email ?? ""} required />
        </div>
        <div>
          <label className="label">Puesto principal</label>
          <select name="role" className="input" defaultValue={worker?.role ?? "CAMARERO"}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" title="Punto de partida de la puntuación; luego mandan las valoraciones de los maîtres">Valoración inicial de RRHH</label>
          <select name="rating" className="input" defaultValue={worker?.rating ?? 3}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{"★".repeat(n)} ({n})</option>
            ))}
          </select>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="label">También puede trabajar como</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roles" value={r} defaultChecked={worker?.roles.includes(r)} className="size-4" />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">
            El puesto en cada evento se elige al convocar: p. ej. un camarero puede ir como camarero responsable en un evento pequeño y como maître en otro.
          </p>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="label">Zona / localidad (opcional)</label>
          <input name="zone" className="input" defaultValue={worker?.zone ?? ""} placeholder="p. ej. Valencia centro, tiene coche" />
        </div>
        <fieldset className="grid gap-4 rounded-lg border border-stone-200 p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Datos laborales (también los puede completar el trabajador en su app)</legend>
          <p className="text-xs text-stone-500 sm:col-span-2">El DNI, la Seguridad Social y el IBAN siempre van con su documento adjunto.</p>
          <IdentityFields values={{ dni: worker?.dni ?? null, nss: worker?.nss ?? null, iban: worker?.iban ?? null }} docs={docs} required={false} inputClass="input mt-1" />
          <div>
            <label className="label">Fecha de nacimiento</label>
            <input name="birthDate" type="date" className="input" defaultValue={worker?.birthDate ?? ""} />
          </div>
          <div>
            <label className="label">Dirección</label>
            <input name="address" className="input" defaultValue={worker?.address ?? ""} />
          </div>
        </fieldset>
        <fieldset className="rounded-lg border border-stone-200 bg-stone-50 p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-semibold">Solo RRHH (el trabajador no lo ve)</legend>
          <div className="mb-3"><ContractFields worker={worker} /></div>
          <label className="label" htmlFor="a3Code">Código de trabajador en A3</label>
          <input id="a3Code" name="a3Code" className="input" defaultValue={worker?.a3Code ?? ""} />
          <label className="label mt-3" htmlFor="a3Center">Centro en A3 (decide el convenio)</label>
          <select id="a3Center" name="a3Center" className="input" defaultValue={worker?.a3Center ?? ""}>
            <option value="">Sin indicar (se usa el 1 · Madrid)</option>
            <option value="1">1 · Madrid</option>
            <option value="2">2 · Segovia</option>
          </select>
          <div className="mt-3">
            <span className="label">Tarifa propia (€/hora, opcional)</span>
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-x-3 gap-y-2 text-sm">
              <span />
              {EVENT_TYPES.map((t) => (
                <span key={t} className="text-stone-600">{EVENT_TYPE_LABEL[t]}</span>
              ))}
              {[{ prefix: "", label: "Camarero / mozo" }, ...OWN_RATE_ROLES.map((r) => ({ prefix: `${r}:`, label: ROLE_LABEL[r] }))].map((row) => (
                <Fragment key={row.label}>
                  <span className="text-stone-600">{row.label}</span>
                  {EVENT_TYPES.map((t) => (
                    <input
                      key={t}
                      name={`own_${row.prefix}${t}`}
                      inputMode="decimal"
                      className="input"
                      placeholder="la del puesto"
                      defaultValue={(worker?.customRates as Record<string, number> | null | undefined)?.[`${row.prefix}${t}`] ?? ""}
                      aria-label={`Tarifa propia de ${row.label.toLowerCase()} en ${EVENT_TYPE_LABEL[t].toLowerCase()}`}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
            <p className="mt-1 text-xs text-stone-500">Si cobra distinto que el resto de su puesto. La de camarero vale también de responsable y de mozo; la de maître, cuando va de maître. Vacío = tarifa del puesto (Ajustes → Tarifas). El plus por evento y el mínimo de horas se mantienen.</p>
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="label">Notas (opcional)</label>
          <textarea name="notes" className="input" rows={3} defaultValue={worker?.notes ?? ""} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <SubmitButton>{worker ? "Guardar cambios" : "Crear trabajador"}</SubmitButton>
    </ActionForm>
  );
}
