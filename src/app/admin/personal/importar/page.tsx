import Link from "next/link";
import { ImportA3 } from "./ImportA3";

export default function ImportStaff() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/personal" className="text-sm text-stone-500 hover:underline">‹ Personal</Link>
        <h1>Importar personal desde A3</h1>
        <div className="max-w-3xl space-y-2 text-sm text-stone-500">
          <p>
            Exporta de A3 el listado de trabajadores (la «Base de Datos») a Excel y súbelo aquí. Puedes hacerlo tantas veces como quieras
            mientras sigáis dando de alta gente en A3: cada persona se busca por su DNI, así que no se duplica nadie.
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li><strong>Quien no está en la app</strong> se da de alta con su código de acceso.</li>
            <li><strong>Quien ya está</strong> solo se completa con lo que le falte (código de A3, NASS, centro, IBAN…); no se cambia nada que ya tenga.</li>
            <li>
              Columnas que se leen: DNI, Nombre (como en A3: «APELLIDOS, NOMBRE»), Código, NASS, Centro, IBAN y, si las añades al listado,
              Teléfono, Email, Nacimiento, Domicilio, Sexo, Nacionalidad, Puesto o Tipo de contrato.
            </li>
            <li>Sin teléfono ni email no pueden entrar en la app: añádelo al listado de A3 o pónselo en su ficha.</li>
          </ul>
          <p>Primero pulsa «Revisar» para ver qué se va a hacer; no se guarda nada hasta que pulses «Importar».</p>
        </div>
      </div>
      <ImportA3 />
    </div>
  );
}
