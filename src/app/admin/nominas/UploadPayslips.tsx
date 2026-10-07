"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { pages: number; workers: number; unknown: { page: number; dni: string | null }[] } | { error: string };

/** Sube el PDF de nóminas de A3 del mes para repartirlo. */
export function UploadPayslips({ month }: { month: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setR(null);
        try {
          const res = await fetch(`/admin/nominas/pdf?mes=${month}`, { method: "POST", body: new FormData(e.currentTarget) });
          setR(await res.json());
          router.refresh();
        } catch {
          setR({ error: "No se ha podido subir. Inténtalo de nuevo." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept="application/pdf" required className="text-sm" />
        <button className="btn btn-primary" disabled={busy}>{busy ? "Separando nóminas…" : "Subir y repartir"}</button>
      </div>
      {r && "error" in r && <p className="text-sm text-red-700">{r.error}</p>}
      {r && !("error" in r) && (
        <div className="text-sm">
          <p className="text-emerald-800">✓ {r.pages} páginas leídas: nóminas repartidas a {r.workers} trabajadores (se les ha avisado).</p>
          {r.unknown.length > 0 && (
            <p className="text-amber-800">
              ⚠ {r.unknown.length} {r.unknown.length === 1 ? "página no se ha podido asignar" : "páginas no se han podido asignar"} (nadie de la plantilla con ese DNI):{" "}
              {r.unknown.slice(0, 15).map((u) => `pág. ${u.page}${u.dni ? ` (${u.dni})` : ""}`).join(", ")}
              {r.unknown.length > 15 && "…"}. Revisa el DNI en su ficha y vuelve a subir el PDF.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
