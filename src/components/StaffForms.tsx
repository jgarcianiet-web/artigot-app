"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { shrinkFormImages, shrinkImage } from "@/lib/image";
import { IDENTITY_FILE_KEYS, IdentityFields } from "./IdentityFields";

type Result = { ok: boolean; message: string } | null;
type Action = (prev: Result, form: FormData) => Promise<Result>;

const DOC_TYPES: [string, string][] = [
  ["DNI", "DNI / NIE"],
  ["NSS", "Tarjeta de la Seguridad Social"],
  ["MANIPULADOR", "Carnet de manipulador de alimentos"],
  ["CUENTA", "Certificado de cuenta bancaria"],
  ["CONTRATO", "Contrato firmado"],
  ["OTRO", "Otro"],
];

function Message({ r }: { r: Result }) {
  if (!r) return null;
  return <p role="status" className={`rounded-lg p-2 text-sm ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{r.message}</p>;
}

type Data = { dni: string | null; nss: string | null; iban: string | null; birthDate: string | null; address: string | null; email: string | null; sex?: string | null; nationality?: string | null };

type DocStatus = Record<string, { fileId: string | null; verified: boolean }>;

export function MyDataForm({ action, data, docs }: { action: Action; data: Data; docs: DocStatus }) {
  const [r, run] = useActionState(action, null);
  return (
    <ActionForm action={run} prepare={(f) => shrinkFormImages(f, IDENTITY_FILE_KEYS)} className="card space-y-3">
      <h2>Mis datos</h2>
      <p className="text-xs text-stone-500">Los necesita RRHH para darte de alta y pagarte. El DNI, la Seguridad Social y el IBAN son obligatorios y van con su documento. Solo los ve RRHH.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <IdentityFields values={{ dni: data.dni, nss: data.nss, iban: data.iban }} docs={docs} required inputClass="input mt-1 text-base" />
        <label className="text-sm">Fecha de nacimiento<input name="birthDate" type="date" className="input mt-1 text-base" defaultValue={data.birthDate ?? ""} /></label>
        <label className="text-sm">
          Sexo (para el alta)
          <select name="sex" className="input mt-1 text-base" defaultValue={data.sex ?? ""}>
            <option value="">—</option>
            <option>Hombre</option>
            <option>Mujer</option>
          </select>
        </label>
        <label className="text-sm">Nacionalidad<input name="nationality" className="input mt-1 text-base" defaultValue={data.nationality ?? ""} placeholder="España" /></label>
        <label className="text-sm">Email<input name="email" type="email" className="input mt-1 text-base" defaultValue={data.email ?? ""} /></label>
        <label className="text-sm sm:col-span-2">Dirección<input name="address" className="input mt-1 text-base" defaultValue={data.address ?? ""} /></label>
      </div>
      <Message r={r} />
      <SubmitButton>Guardar mis datos</SubmitButton>
    </ActionForm>
  );
}

/** Subida de documento (trabajador o RRHH). Las fotos se reducen antes de enviarse. */
export function DocumentUploadForm({ action, title = "Subir documento" }: { action: Action; title?: string }) {
  const [r, run, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (r?.ok) ref.current?.reset();
  }, [r]);
  return (
    <form
      ref={ref}
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const file = form.get("file");
        if (file instanceof File && file.type.startsWith("image/")) form.set("file", await shrinkImage(file, 2000, 0.85));
        startTransition(() => run(form));
      }}
    >
      <h2>{title}</h2>
      <select name="type" className="input" required defaultValue="">
        <option value="" disabled>Tipo de documento…</option>
        {DOC_TYPES.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <input name="label" className="input" placeholder="Descripción (opcional)" />
      <label className="block text-sm">
        Caduca el (si tiene caducidad)
        <input name="expiresAt" type="date" className="input mt-1" />
      </label>
      <label className="block text-sm">
        Foto o PDF
        <input name="file" type="file" accept="image/*,application/pdf" className="mt-1 block w-full text-sm" required />
      </label>
      <Message r={r} />
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Subiendo…" : "Subir"}</button>
    </form>
  );
}

export function SwapProposalForm({ action, partners }: { action: Action; partners: { id: string; name: string; zone: string | null }[] }) {
  const [r, run] = useActionState(action, null);
  return (
    <ActionForm action={run} className="card space-y-3">
      <h2>Proponer un cambio</h2>
      <p className="text-sm text-stone-500">Elige a un compañero libre ese día. Si acepta, RRHH lo aprueba y quedarás liberado sin penalización.</p>
      <select name="toWorkerId" className="input text-base" required defaultValue="">
        <option value="" disabled>Elige un compañero…</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>{p.name}{p.zone ? ` · ${p.zone}` : ""}</option>
        ))}
      </select>
      <textarea name="message" className="input text-base" rows={2} maxLength={300} placeholder="Mensaje para tu compañero (opcional)" />
      <Message r={r} />
      <SubmitButton>Enviar propuesta</SubmitButton>
    </ActionForm>
  );
}

/** Lista de «qué llevar» con casillas que se recuerdan en este móvil. */
export function Checklist({ id, uniform, extra, roleLabel }: { id: string; uniform: string[]; extra: string[]; roleLabel: string }) {
  const storageKey = `checklist:${id}`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
    } catch {}
  }, [storageKey]);
  const items = [...uniform, ...extra];
  if (!items.length) return null;
  const toggle = (item: string) => {
    const next = done.includes(item) ? done.filter((d) => d !== item) : [...done, item];
    setDone(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };
  return (
    <div className="rounded-lg bg-stone-50 p-3">
      <div className="mb-1 text-sm font-semibold">🎒 Qué llevar <span className="font-normal text-stone-500">({done.filter((d) => items.includes(d)).length}/{items.length})</span></div>
      <ul className="space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={item + i}>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4" checked={done.includes(item)} onChange={() => toggle(item)} />
              <span className={done.includes(item) ? "text-stone-400 line-through" : ""}>{item}</span>
              {i === uniform.length && extra.length > 0 && <span className="ml-auto text-[10px] text-brand-700">este evento</span>}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-stone-400">Uniforme de {roleLabel.toLowerCase()} + lo propio del evento</p>
    </div>
  );
}
