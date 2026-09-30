import Link from "next/link";
import { saveUniform } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { ROLE_LABEL, ROLES } from "@/lib/domain";
import { getUniform } from "@/lib/staff";

export default async function UniformSettings() {
  const uniform = await getUniform();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Uniforme por puesto</h1>
        <p className="text-sm text-stone-500">
          Lo que cada puesto debe llevar siempre. En la app, el personal lo ve como lista de «Qué llevar» junto con lo específico de cada evento.
        </p>
      </div>
      <form action={saveUniform} className="card max-w-3xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r}>
              <label className="label" htmlFor={r}>{ROLE_LABEL[r]}</label>
              <textarea id={r} name={r} rows={5} className="input" defaultValue={uniform[r].join("\n")} />
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-500">Una cosa por línea.</p>
        <SubmitButton>Guardar</SubmitButton>
      </form>
    </div>
  );
}
