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

type Data = { dni: string | null; nss: string | null; iban: string | null; birthDate: string | null; address: string | null; email: string | null; sex?: string | null; nationality?: string | null; phone?: string | null };

type DocStatus = Record<string, { fileId: string | null; verified: boolean }>;

export function MyDataForm({ action, data, docs }: { action: Action; data: Data; docs: DocStatus }) {
  const [r, run] = useActionState(action, null);
  return (
    <ActionForm action={run} prepare={(f) => shrinkFormImages(f, IDENTITY_FILE_KEYS)} className="card space-y-3">
      <h2>Mis datos</h2>
      <p className="text-xs text-stone-500">Los necesita RRHH para darte de alta y pagarte. El DNI, la Seguridad Social y el IBAN son obligatorios y van con su documento. Solo los ve RRHH.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <IdentityFields values={{ dni: data.dni, nss: data.nss, iban: data.iban }} docs={docs} required inputClass="input mt-1 text-base" />
        {!data.phone && (
          <label className="text-sm sm:col-span-2">
            Teléfono móvil <span className="text-red-600">(nos falta)</span>
            <input name="phone" type="tel" autoComplete="tel" className="input mt-1 text-base" placeholder="600 123 456" />
          </label>
        )}
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
        <label className="text-sm">Email<input name="email" type="email" className="input mt-1 text-base" defaultValue={data.email ?? ""} required /></label>
        <label className="text-sm sm:col-span-2">Dirección<input name="address" className="input mt-1 text-base" defaultValue={data.address ?? ""} /></label>
      </div>
      <Message r={r} />
      <SubmitButton>Guardar mis datos</SubmitButton>
    </ActionForm>
  );
}

/** Foto de perfil: se reduce en el móvil y la revisa RRHH. */
export function PhotoForm({ action, photoId, status, note }: { action: Action; photoId: string | null; status: string | null; note: string | null }) {
  const [r, run, pending] = useActionState(action, null);
  const [preview, setPreview] = useState<string | null>(null);
  const label = !photoId ? (status === "RECHAZADA" ? "Rechazada" : "Falta") : status === "ACEPTADA" ? "Aceptada" : "Pendiente de revisar";
  const cls = !photoId ? "bg-red-100 text-red-700" : status === "ACEPTADA" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900";
  return (
    <form
      id="foto"
      className="card flex flex-wrap items-center gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const file = form.get("photo");
        if (file instanceof File && file.size) form.set("photo", await shrinkImage(file, 900, 0.85));
        startTransition(() => run(form));
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview || photoId ? <img src={preview ?? `/api/files/${photoId}`} alt="Tu foto de perfil" className="size-24 rounded-full object-cover" /> : <div className="flex size-24 items-center justify-center rounded-full bg-stone-200 text-3xl">👤</div>}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <h2>Foto de perfil</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
        </div>
        {status === "RECHAZADA" && note && <p className="text-sm text-red-700">Motivo: {note}. Sube otra.</p>}
        <p className="text-xs text-stone-500">Obligatoria. De frente, con la cara bien visible, sin gafas de sol ni filtros. RRHH la revisa.</p>
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="user"
          required
          className="block w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        <Message r={r} />
        <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Subiendo…" : photoId ? "Cambiar foto" : "Subir foto"}</button>
      </div>
    </form>
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
