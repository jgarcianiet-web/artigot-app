"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, ROLE_LABEL, type Role } from "@/lib/domain";

type Row = {
  id: string;
  name: string;
  role: string;
  first: string;
  s1: string;
  s2: string;
  guessed: boolean;
  sex: string;
  birth: string;
  nat: string;
  start: string;
  nextService: string | null;
  problems: string[];
};

export function AltaTable({ rows, next, countries }: { rows: Row[]; next: number; countries: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(rows.filter((r) => r.nextService && !r.problems.length).map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [files, setFiles] = useState<{ name: string; label: string; url: string }[]>([]);
  // Códigos correlativos para los marcados, en el orden de la lista
  const codes = useMemo(() => {
    let n = next;
    return new Map(rows.filter((r) => selected.has(r.id)).map((r) => [r.id, String(n++)]));
  }, [rows, selected, next]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const c = new Set(s);
      if (c.has(id)) c.delete(id);
      else c.add(id);
      return c;
    });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/admin/altas/a3/descargar", { method: "POST", body: new FormData(e.currentTarget) });
      if (!res.ok) {
        setMsg(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se ha podido generar el Excel.");
        return;
      }
      const data = (await res.json()) as { files: { name: string; label: string; base64: string }[]; missingImputation: boolean };
      const list = data.files.map((f) => {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        return { ...f, url: URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })) };
      });
      setFiles(list);
      for (const f of list) {
        const a = document.createElement("a");
        a.href = f.url;
        a.download = f.name;
        a.click();
        await new Promise((r) => setTimeout(r, 400));
      }
      setMsg(
        `${list.length === 1 ? "Excel descargado" : `${list.length} Excel descargados`} con ${codes.size} altas. Ya tienen su código de A3; impórtalos en A3 en este orden: ${list.map((f) => `«${f.label}»`).join(", ")}.` +
          (data.missingImputation ? " (El de imputación no se genera hasta que pongas el código en Ajustes → A3.)" : ""),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <datalist id="a3-countries">
        {countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="card overflow-x-auto p-0">
        <table className="table text-sm">
          <thead>
            <tr>
              <th />
              <th>Trabajador</th>
              <th>Código</th>
              <th>Fecha alta</th>
              <th>Nombre</th>
              <th>1er apellido</th>
              <th>2º apellido</th>
              <th>Sexo</th>
              <th>Nacimiento</th>
              <th>Nacionalidad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = selected.has(r.id);
              return (
                <tr key={r.id} className={on ? "" : "opacity-60"}>
                  <td>
                    <input type="checkbox" name="id" value={r.id} checked={on} onChange={() => toggle(r.id)} aria-label={`Dar de alta a ${r.name}`} />
                  </td>
                  <td className="min-w-44">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-stone-500">
                      {ROLE_LABEL[r.role as Role] ?? r.role}
                      {r.nextService ? ` · trabaja el ${formatDate(r.nextService)}` : " · sin servicios próximos"}
                    </span>
                    {r.problems.length > 0 && <span className="block text-xs text-red-600">Falta: {r.problems.join(", ")}</span>}
                  </td>
                  <td>
                    <input name={`code_${r.id}`} value={codes.get(r.id) ?? ""} readOnly={!on} onChange={() => {}} className="input w-20 bg-stone-50" tabIndex={-1} aria-label="Código" />
                  </td>
                  <td><input type="date" name={`start_${r.id}`} defaultValue={r.start} className="input w-36" aria-label="Fecha de alta" /></td>
                  <td><input name={`first_${r.id}`} defaultValue={r.first} className="input w-32" aria-label="Nombre" /></td>
                  <td><input name={`s1_${r.id}`} defaultValue={r.s1} className={`input w-32 ${r.guessed ? "border-amber-400" : ""}`} aria-label="Primer apellido" /></td>
                  <td><input name={`s2_${r.id}`} defaultValue={r.s2} className={`input w-32 ${r.guessed ? "border-amber-400" : ""}`} aria-label="Segundo apellido" /></td>
                  <td>
                    <select name={`sex_${r.id}`} defaultValue={r.sex} className="input w-28" aria-label="Sexo">
                      <option value="">—</option>
                      <option>Hombre</option>
                      <option>Mujer</option>
                    </select>
                  </td>
                  <td><input type="date" name={`birth_${r.id}`} defaultValue={r.birth} className="input w-36" aria-label="Fecha de nacimiento" /></td>
                  <td><input name={`nat_${r.id}`} defaultValue={r.nat} list="a3-countries" placeholder="ESPAÑA" className="input w-36" aria-label="Nacionalidad" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        Los apellidos con borde ámbar se han separado del nombre automáticamente: compruébalos. Se marcan por defecto quienes tienen un servicio próximo y todos sus datos.
      </p>
      {msg && <p className="rounded-lg bg-stone-100 p-3 text-sm">{msg}</p>}
      {files.length > 1 && (
        <p className="flex flex-wrap gap-2 text-sm">
          {files.map((f) => (
            <a key={f.name} href={f.url} download={f.name} className="btn btn-sm">⬇ {f.label}</a>
          ))}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy || selected.size === 0}>
        {busy ? "Generando…" : `⬇ Descargar los Excel de alta para A3 (${selected.size})`}
      </button>
    </form>
  );
}
