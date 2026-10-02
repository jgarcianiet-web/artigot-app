"use client";

import { useActionState, useEffect, useState } from "react";
import { bulkWorkers } from "@/app/actions";

const FORM = "bulk-workers";
const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[name=ids][form=${FORM}]`)];

/** Casilla para marcar o desmarcar a todos los de la lista. */
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Seleccionar a todos"
      className="size-4"
      onChange={(e) => {
        for (const b of boxes()) b.checked = e.target.checked;
        document.dispatchEvent(new Event("bulk-change"));
      }}
    />
  );
}

/** Acciones con los seleccionados: dar de baja (desactivar) o borrar definitivamente. */
export function BulkBar() {
  const [n, setN] = useState(0);
  const [msg, run, pending] = useActionState(bulkWorkers, null);
  useEffect(() => {
    const count = () => setN(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", count);
    document.addEventListener("bulk-change", count);
    return () => {
      document.removeEventListener("change", count);
      document.removeEventListener("bulk-change", count);
    };
  }, []);
  useEffect(() => {
    if (msg) setN(boxes().filter((b) => b.checked).length);
  }, [msg]);
  return (
    <form
      id={FORM}
      action={run}
      className={`sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm ${n ? "border-stone-300 bg-white shadow-sm" : "border-transparent"}`}
      onSubmit={(e) => {
        const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
        if (action?.startsWith("contrato")) return;
        const text =
          action === "borrar"
            ? `¿Borrar definitivamente a ${n} ${n === 1 ? "persona" : "personas"}? Se borra su ficha, documentos e historial. Quien ya tenga pagos registrados no se borra (dalo de baja).`
            : `¿Dar de baja a ${n} ${n === 1 ? "persona" : "personas"}? No podrán entrar en la app ni se les convocará.`;
        if (!confirm(text)) e.preventDefault();
      }}
    >
      <span className="text-stone-600">{n ? `${n} seleccionados` : "Marca a varios para cambiarles el contrato, darlos de baja o borrarlos"}</span>
      {n > 0 && (
        <>
          <span className="text-stone-400">Marcar como:</span>
          <button name="accion" value="contrato:300" className="btn btn-sm" disabled={pending}>Extra</button>
          <button name="accion" value="contrato:fijo" className="btn btn-sm" disabled={pending}>Fijo</button>
          <button name="accion" value="contrato:fijo-sin" className="btn btn-sm" disabled={pending}>Fijo sin fichaje</button>
          <span className="text-stone-300">|</span>
          <button name="accion" value="desactivar" className="btn btn-sm" disabled={pending}>Dar de baja</button>
          <button name="accion" value="borrar" className="btn btn-sm btn-danger" disabled={pending}>Borrar</button>
        </>
      )}
      {msg && <span className="text-stone-700">{msg}</span>}
    </form>
  );
}
