import Link from "next/link";
import { Empty } from "@/components/ui";
import { getA3 } from "@/lib/a3";
import { altaProblems, nextA3Code, pendingAltas, splitName, templateLists } from "@/lib/a3alta";
import { today } from "@/lib/domain";
import { AltaTable } from "./AltaTable";

export default async function A3Altas() {
  const t = today();
  const [pending, next, lists, a3] = await Promise.all([pendingAltas(t), nextA3Code(), templateLists(), getA3()]);
  const rows = pending.map(({ worker: w, nextService }) => {
    const n = splitName(w);
    return {
      id: w.id,
      name: w.name,
      role: w.role,
      first: n.first,
      s1: n.s1,
      s2: n.s2,
      guessed: n.guessed,
      sex: w.sex ?? "",
      birth: w.birthDate ?? "",
      nat: w.nationality ?? "",
      start: nextService ?? t,
      nextService,
      problems: altaProblems(w).filter((p) => p !== "sexo" && p !== "fecha de nacimiento"),
    };
  });
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/altas" className="text-sm text-stone-500 hover:underline">‹ Altas y bajas</Link>
        <h1>Alta en A3</h1>
        <p className="text-sm text-stone-500">
          Personal activo sin código de A3. Revisa nombre y apellidos, sexo y nacimiento, marca a quién dar de alta y descarga el Excel de «Alta masiva de trabajadores» para
          importarlo en A3. Al descargarlo se les asigna el código. Los valores de convenio, contrato, categoría… están en{" "}
          <Link href="/admin/ajustes/a3" className="link">Ajustes → Nóminas A3</Link>.
        </p>
      </div>
      {!a3.companyCode && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Falta el código de empresa de A3. <Link href="/admin/ajustes/a3" className="link">Ponlo en Ajustes → Nóminas A3</Link>.
        </p>
      )}
      {rows.length === 0 ? <Empty>Todo el personal activo tiene código de A3.</Empty> : <AltaTable rows={rows} next={next} countries={lists.countries} />}
    </div>
  );
}
