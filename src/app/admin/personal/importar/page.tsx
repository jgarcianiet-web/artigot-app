import Link from "next/link";
import { ImportForm } from "./ImportForm";

export default function ImportStaff() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/personal" className="text-sm text-stone-500 hover:underline">‹ Personal</Link>
        <h1>Importar personal desde Excel</h1>
        <p className="text-sm text-stone-500">
          Sube vuestra lista actual. Primero verás qué se va a hacer con cada fila; no se guarda nada hasta que pulses «Importar».
          Los trabajadores se identifican por el teléfono, así que puedes volver a importar la lista sin crear duplicados.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
