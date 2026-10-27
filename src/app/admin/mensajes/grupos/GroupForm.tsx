"use client";

import { useActionState, useMemo, useState } from "react";
import { ROLE_PLURAL, ROLES } from "@/lib/domain";
import { saveGroupAction } from "../actions";

type W = { id: string; name: string; dni: string | null; phone: string | null; roles: string[] };

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const SHOWN = 150;

/** Crear o editar un grupo con el personal: nombre, «solo RRHH escribe» y a quién se añade (buscando o por puesto). */
export function GroupForm({ workers, group }: { workers: W[]; group?: { id: string; name: string; onlyStaff: boolean; memberIds: string[] } }) {
  const [msg, run, pending] = useActionState(saveGroupAction, null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(group?.memberIds ?? []));
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("");
  const index = useMemo(() => workers.map((w) => ({ w, key: norm(`${w.name} ${w.dni ?? ""} ${w.phone ?? ""}`) })), [workers]);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const filtered = index.filter((x) => (!role || x.w.roles.includes(role)) && words.every((wd) => x.key.includes(wd))).map((x) => x.w);
  const byId = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const filtering = words.length > 0 || !!role;
  const allIn = filtered.length > 0 && filtered.every((w) => selected.has(w.id));

  return (
    <form action={run} className="space-y-4">
      {group && <input type="hidden" name="id" value={group.id} />}
      {[...selected].map((id) => <input key={id} type="hidden" name="members" value={id} />)}
      <div className="card space-y-3">
        <label className="block text-sm font-medium">
          Nombre del grupo
          <input name="name" className="input mt-1" defaultValue={group?.name} placeholder="P. ej. Maîtres, Fijos Segovia, Bodas sábado…" required maxLength={60} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="onlyStaff" defaultChecked={group?.onlyStaff} className="mt-0.5 size-4" />
          <span>
            <span className="font-medium">Solo RRHH puede escribir</span>
            <span className="block text-xs text-stone-500">Para avisos: el personal lo lee pero no puede contestar en el grupo (sí por su chat privado con RRHH).</span>
          </span>
        </label>
      </div>

      <div className="card space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium">Personas del grupo</div>
          <div className="text-sm text-stone-600">{selected.size} elegidas</div>
        </div>
        {selected.size > 0 && (
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {[...selected].map((id) => (
              <button key={id} type="button" onClick={() => toggle(id, false)} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs hover:bg-red-50" title="Quitar">
                {byId.get(id)?.name ?? "—"} ✕
              </button>
            ))}
          </div>
        )}
        <input type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, apellidos, DNI o teléfono…" aria-label="Buscar personas" />
        <div className="flex flex-wrap gap-1">
          {[["", "Todos"], ...ROLES.map((r) => [r, ROLE_PLURAL[r]])].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRole(k)} className={`rounded-full px-2.5 py-1 text-xs ${role === k ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"}`}>
              {label}
            </button>
          ))}
        </div>
        {filtering && filtered.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => setSelected((s) => { const n = new Set(s); for (const w of filtered) if (allIn) n.delete(w.id); else n.add(w.id); return n; })}>
            {allIn ? `Quitar los ${filtered.length} de la lista` : `Añadir los ${filtered.length} de la lista`}
          </button>
        )}
        <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200 text-sm">
          {filtered.length === 0 && <li className="px-3 py-2 text-stone-500">Nadie con ese filtro</li>}
          {filtered.slice(0, SHOWN).map((w) => (
            <li key={w.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-stone-50">
                <input type="checkbox" className="size-4" checked={selected.has(w.id)} onChange={(e) => toggle(w.id, e.target.checked)} />
                <span className="flex-1">{w.name}</span>
                <span className="text-xs text-stone-400">{w.dni}</span>
              </label>
            </li>
          ))}
          {filtered.length > SHOWN && <li className="px-3 py-2 text-xs text-stone-500">Y {filtered.length - SHOWN} más: busca o filtra para verlos.</li>}
        </ul>
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{group ? "Guardar cambios" : "Crear grupo"}</button>
    </form>
  );
}
