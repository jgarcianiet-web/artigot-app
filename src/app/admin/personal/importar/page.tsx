import Link from "next/link";
import { A3ImportForm } from "@/app/admin/ajustes/a3/AltaForms";
import { ImportForm } from "./ImportForm";

export default function ImportStaff() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/personal" className="text-sm text-stone-500 hover:underline">‹ Personal</Link>
        <h1>Importar personal desde Excel</h1>
        <p className="text-sm text-stone-500">
          Sube vuestra lista actual. Primero verás qué se va a hacer con cada fila; no se guarda nada hasta que pulses «Importar».
          Los trabajadores se identifican por el teléfono (o el email si no tienen teléfono), así que puedes volver a importar la lista sin crear duplicados.
          Quien no tenga teléfono entra en la app con su email.
        </p>
      </div>
      <ImportForm />
      <A3ImportForm
        title="Completar los datos que faltan con otro Excel"
        rates
        text="Sube cualquier otro Excel o CSV (la base de datos de A3, un listado de la gestoría…) con columnas como DNI, Nombre, Teléfono, Email, NSS, IBAN, CÓDIGO, Nacimiento, Dirección o la tarifa propia de cada persona («Evento», «Boda», «Maître evento», «Maître boda»; o «Tarifa» para todos). Se busca a cada persona por DNI, teléfono, email o nombre y se rellena solo lo que le falta; no se cambia nada que ya esté puesto. Lo que siga faltando se le pide a cada trabajador en la app."
      />
    </div>
  );
}
