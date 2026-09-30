"use client";

import { useActionState, useRef } from "react";
import { savePrivacy } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/client";

export function PrivacyForm({ email, template, version, signed, defaultTemplate }: { email: string; template: string; version: number; signed: number; defaultTemplate: string }) {
  const [msg, run] = useActionState(savePrivacy, null);
  const tpl = useRef<HTMLTextAreaElement>(null);
  return (
    <ActionForm action={run} className="card max-w-4xl space-y-4">
      <div>
        <h2>Protección de datos</h2>
        <p className="text-sm text-stone-500">
          El personal la firma en la app antes de subir su documentación. Versión {version} · firmada por {signed} {signed === 1 ? "persona" : "personas"}.
        </p>
      </div>
      <label className="block text-sm">Email de contacto para protección de datos<input name="email" type="email" className="input mt-1" defaultValue={email} placeholder="rrhh@empresa.es" /></label>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="privacyTemplate">Texto</label>
          <button type="button" className="text-xs text-stone-500 underline" onClick={() => tpl.current && (tpl.current.value = defaultTemplate)}>Restaurar el texto por defecto</button>
        </div>
        <textarea ref={tpl} id="privacyTemplate" name="template" rows={18} className="input font-mono text-xs" defaultValue={template} />
        <p className="mt-1 text-xs text-stone-500">Marcadores: {"{{empresa}} {{cif}} {{domicilio}} {{ciudad}} {{hoy}} {{email_privacidad}} {{trabajador}} {{dni}}"}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="newVersion" value="1" className="mt-0.5" />
        <span>Publicar como <b>versión nueva</b>: quien ya firmó tendrá que volver a firmar (recibirá un aviso). Déjalo sin marcar para correcciones menores.</span>
      </label>
      <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">El texto por defecto es orientativo. Que lo revise vuestra asesoría o vuestro delegado de protección de datos.</p>
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
      <SubmitButton>Guardar protección de datos</SubmitButton>
    </ActionForm>
  );
}
