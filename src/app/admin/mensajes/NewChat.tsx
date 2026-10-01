"use client";

import { useActionState, useState } from "react";
import { newGroup, openDirect } from "./actions";

/** Abrir una conversación con alguien o crear un grupo. */
export function NewChat({ people }: { people: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<"none" | "direct" | "group">("none");
  const [msg, run, pending] = useActionState(newGroup, null);
  if (!people.length) return <p className="px-1 text-xs text-stone-500">Cuando haya más usuarios de RRHH podréis hablar en privado o en grupos.</p>;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" className={`btn btn-sm flex-1 ${mode === "direct" ? "btn-primary" : ""}`} onClick={() => setMode(mode === "direct" ? "none" : "direct")}>+ Chat</button>
        <button type="button" className={`btn btn-sm flex-1 ${mode === "group" ? "btn-primary" : ""}`} onClick={() => setMode(mode === "group" ? "none" : "group")}>+ Grupo</button>
      </div>
      {mode === "direct" && (
        <ul className="card divide-y p-0 text-sm">
          {people.map((p) => (
            <li key={p.id}>
              <form action={openDirect}>
                <input type="hidden" name="adminId" value={p.id} />
                <button className="w-full px-3 py-2 text-left hover:bg-stone-50">{p.name}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {mode === "group" && (
        <form action={run} className="card space-y-2 p-3">
          <input name="name" className="input" placeholder="Nombre del grupo (p. ej. Bodas)" required maxLength={60} aria-label="Nombre del grupo" />
          <div className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input type="checkbox" name="members" value={p.id} className="size-4" /> {p.name}
              </label>
            ))}
          </div>
          {msg && <p className="text-xs text-red-700">{msg}</p>}
          <button className="btn btn-primary btn-sm w-full" disabled={pending}>Crear grupo</button>
        </form>
      )}
    </div>
  );
}
