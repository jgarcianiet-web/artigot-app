"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { RoleBadge } from "@/components/ui";
import { ROLE_LABEL, ROLES } from "@/lib/domain";
import type { ImportRow } from "@/lib/importStaff";
import { commitImport, previewImport, type ImportState } from "./actions";

const FIELD_LABEL: Record<string, string> = {
  name: "Nombre",
  surname: "Apellidos",
  phone: "Teléfono",
  role: "Puesto",
  email: "Email",
  zone: "Zona",
  rating: "Valoración",
  notes: "Notas",
};

const STATUS: Record<ImportRow["status"], { label: string; cls: string }> = {
  nuevo: { label: "Nuevo", cls: "bg-emerald-100 text-emerald-800" },
  actualizar: { label: "Se actualiza", cls: "bg-sky-100 text-sky-800" },
  existe: { label: "Ya existe", cls: "bg-stone-200 text-stone-600" },
  error: { label: "Error", cls: "bg-red-100 text-red-700" },
};

export function ImportForm() {
  const [fileKey, setFileKey] = useState(0);
  const [state, action, pending] = useActionState<ImportState, FormData>(
    (prev, form) => (form.get("intent") === "commit" ? commitImport(prev, form) : previewImport(prev, form)),
    { step: "idle" },
  );
  const [filter, setFilter] = useState<"todas" | "error">("todas");
  const [dirty, setDirty] = useState(false);

  if (state.step === "done" && !dirty && !pending) {
    return (
      <div className="card space-y-3">
        <h2>Importación completada</h2>
        <ul className="text-sm">
          <li>✅ {state.created} trabajadores nuevos (con su código de acceso generado)</li>
          {state.updated > 0 && <li>🔄 {state.updated} actualizados</li>}
          {state.skipped > 0 && <li>⏭ {state.skipped} ya existían y no se han tocado</li>}
          {state.errors > 0 && <li className="text-red-700">⚠ {state.errors} filas con errores no se han importado</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/personal" className="btn btn-primary">Ver personal</Link>
          <a href="/admin/personal/exportar" className="btn">Descargar códigos de acceso (Excel)</a>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDirty(true);
              setFileKey((k) => k + 1);
            }}
          >
            Importar otro archivo
          </button>
        </div>
      </div>
    );
  }

  const preview = state.step === "preview" && !dirty ? state.preview : null;
  const rows = preview ? (filter === "error" ? preview.rows.filter((r) => r.status === "error") : preview.rows) : [];
  const toImport = preview ? preview.counts.nuevo + preview.counts.actualizar : 0;

  return (
    <form
      // Envío manual (sin `action`): React vaciaría el formulario tras «Revisar» y se perdería el archivo elegido
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const data = new FormData(e.currentTarget, submitter);
        setDirty(false);
        startTransition(() => action(data));
      }}
      onChange={() => setDirty(true)}
      className="space-y-4"
    >
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="file">Archivo Excel (.xlsx) o CSV</label>
          <input
            key={fileKey}
            id="file"
            name="file"
            type="file"
            required
            accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-white"
          />
          <p className="mt-1 text-xs text-stone-500">
            Primera fila con cabeceras. Columnas reconocidas: Nombre (y Apellidos), Teléfono, Puesto, Email, Zona, Valoración, Notas.{" "}
            <a href="/admin/personal/importar/plantilla" className="link">Descargar plantilla</a>
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="defaultRole">Puesto si la fila no lo indica</label>
            <select id="defaultRole" name="defaultRole" className="input" defaultValue="">
              <option value="">Ninguno (marcar como error)</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="updateExisting" value="1" className="size-4" />
            Actualizar los datos de quien ya existe (mismo teléfono)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button name="intent" value="preview" className="btn" disabled={pending}>
            {pending ? "Leyendo…" : "1. Revisar archivo"}
          </button>
          {preview && toImport > 0 && (
            <button name="intent" value="commit" className="btn btn-primary" disabled={pending}>
              2. Importar {toImport} {toImport === 1 ? "trabajador" : "trabajadores"}
            </button>
          )}
        </div>
        {state.step === "error" && !dirty && <p className="text-sm text-red-600">{state.error}</p>}
      </div>

      {preview && (
        <div className="card space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {(Object.keys(STATUS) as ImportRow["status"][]).map((s) => (
              <span key={s} className={`rounded-full px-2.5 py-0.5 ${STATUS[s].cls}`}>
                {STATUS[s].label}: <strong>{preview.counts[s]}</strong>
              </span>
            ))}
          </div>
          <p className="text-xs text-stone-500">
            Columnas detectadas:{" "}
            {preview.columns.map((c, i) => (
              <span key={i} className={c.field ? "text-stone-700" : "text-stone-400 line-through"}>
                «{c.header}»{c.field && ` → ${FIELD_LABEL[c.field]}`}
                {i < preview.columns.length - 1 && ", "}
              </span>
            ))}
          </p>
          {preview.counts.error > 0 && (
            <div className="flex gap-1 text-sm">
              <button type="button" onClick={() => setFilter("todas")} className={`rounded-md px-2 py-1 ${filter === "todas" ? "bg-brand-100 text-brand-900" : ""}`}>
                Todas
              </button>
              <button type="button" onClick={() => setFilter("error")} className={`rounded-md px-2 py-1 ${filter === "error" ? "bg-brand-100 text-brand-900" : ""}`}>
                Solo errores ({preview.counts.error})
              </button>
            </div>
          )}
          <div className="max-h-[32rem] overflow-auto">
            <table className="table">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>Fila</th>
                  <th>Estado</th>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Puesto</th>
                  <th className="hidden md:table-cell">Zona</th>
                  <th className="hidden md:table-cell">Email</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={r.status === "error" ? "bg-red-50/50" : ""}>
                    <td className="text-stone-500">{r.line}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                      {r.message && <div className="text-xs text-red-700">{r.message}</div>}
                      {r.existingName && <div className="text-xs text-stone-500">= {r.existingName}</div>}
                    </td>
                    <td>{r.name || <span className="text-stone-400">—</span>}</td>
                    <td className="whitespace-nowrap">{r.phone || <span className="text-stone-400">—</span>}</td>
                    <td>{r.role ? <RoleBadge role={r.role} /> : <span className="text-xs text-stone-500">{r.roleRaw}</span>}</td>
                    <td className="hidden text-stone-500 md:table-cell">{r.zone}</td>
                    <td className="hidden text-stone-500 md:table-cell">{r.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </form>
  );
}
