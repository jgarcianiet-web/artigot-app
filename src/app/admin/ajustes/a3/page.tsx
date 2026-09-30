import Link from "next/link";
import { saveA3Codes } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { getA3 } from "@/lib/a3";
import { db } from "@/lib/db";
import { A3Form } from "./A3Form";

export default async function A3Settings() {
  const [cfg, workers] = await Promise.all([
    getA3(),
    db.worker.findMany({ where: { active: true, a3Code: null }, orderBy: { name: "asc" }, select: { id: true, name: true, dni: true } }),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Nóminas A3</h1>
        <p className="text-sm text-stone-500">
          Con estos códigos, <Link href="/admin/liquidacion" className="link">Liquidación → Exportar a A3</Link> genera un Excel (o CSV) con una línea por
          trabajador y puesto: horas, precio e importe del periodo, listo para importar como variables de nómina.
        </p>
      </div>
      <A3Form cfg={cfg} />
      <div className="card max-w-3xl space-y-3">
        <h2>Personal activo sin código de A3 ({workers.length})</h2>
        {workers.length === 0 ? (
          <p className="text-sm text-stone-500">Todo el personal activo tiene su código. 👍</p>
        ) : (
          <form action={saveA3Codes} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {workers.map((w) => (
                <label key={w.id} className="flex items-center gap-2 text-sm">
                  <span className="w-44 truncate">{w.name}{w.dni ? <span className="text-stone-400"> · {w.dni}</span> : null}</span>
                  <input name={`a3_${w.id}`} className="input" placeholder="Código" />
                </label>
              ))}
            </div>
            <SubmitButton>Guardar códigos</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
