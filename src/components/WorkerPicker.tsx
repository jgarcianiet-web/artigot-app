"use client";

import { useMemo, useRef, useState } from "react";

export type PickerWorker = { id: string; name: string; dni?: string | null; phone?: string | null; zone?: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Buscador de personas: se escribe cualquier parte del nombre, los apellidos, el DNI o el teléfono
 * (sin importar tildes ni mayúsculas) y se elige de la lista. Guarda el id en un campo oculto.
 */
export function WorkerPicker({ workers, name = "workerId", defaultId, required }: { workers: PickerWorker[]; name?: string; defaultId?: string; required?: boolean }) {
  const initial = workers.find((w) => w.id === defaultId);
  const [q, setQ] = useState(initial?.name ?? "");
  const [picked, setPicked] = useState<PickerWorker | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const index = useMemo(() => workers.map((w) => ({ w, key: norm(`${w.name} ${w.dni ?? ""} ${w.phone ?? ""} ${(w.phone ?? "").replace(/\D/g, "")}`) })), [workers]);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const matches = picked && picked.name === q ? [] : index.filter((x) => words.every((wd) => x.key.includes(wd))).slice(0, 30).map((x) => x.w);
  const choose = (w: PickerWorker) => {
    setPicked(w);
    setQ(w.name);
    setOpen(false);
  };
  return (
    <div className="relative">
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      <input
        type="search"
        className="input mt-1"
        value={q}
        placeholder="Escribe el nombre, apellidos, DNI o teléfono…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-label="Buscar persona"
        required={required && !picked}
        onChange={(e) => {
          setQ(e.target.value);
          setPicked(null);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
        }}
      />
      {picked && <p className="mt-1 text-xs text-emerald-700">✓ {picked.name}{picked.dni ? ` · ${picked.dni}` : ""}</p>}
      {open && words.length > 0 && !picked && (
        <ul ref={list} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white text-sm shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-stone-500">Nadie con «{q}»</li>}
          {matches.map((w, i) => (
            <li
              key={w.id}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-stone-100" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); choose(w); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="font-medium">{w.name}</span>
              <span className="ml-2 text-xs text-stone-500">{[w.dni, w.phone, w.zone].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
