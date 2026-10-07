"use client";

import { useState } from "react";

/** Descarga los 4 Excel de nóminas para A3 de una vez. */
export function DownloadNominas({ month, n }: { month: string; n: number }) {
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ name: string; label: string; url: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/admin/nominas/descargar?mes=${month}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { files: { name: string; label: string; base64: string }[] };
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
      setMsg(`Descargados los ${list.length} Excel con ${n} nóminas. Impórtalos en A3 en orden (1, 2, 3 y 4).`);
    } catch {
      setMsg("No se han podido generar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Generando…" : `⬇ Descargar los 4 Excel para A3 (${n} nóminas)`}</button>
      {msg && <p className="text-sm">{msg}</p>}
      {files.length > 0 && (
        <p className="flex flex-wrap gap-2 text-sm">
          {files.map((f) => <a key={f.name} href={f.url} download={f.name} className="btn btn-sm">⬇ {f.label}</a>)}
        </p>
      )}
    </div>
  );
}
