import Link from "next/link";
import { ImportForm } from "../Forms";

export default function ImportEmployments() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/altas" className="text-sm text-stone-500 hover:underline">‹ Altas y bajas</Link>
        <h1>Importar el Excel de altas y bajas</h1>
        <p className="text-sm text-stone-500">Revisa la vista previa antes de importar. Se puede importar más de una vez: las altas con la misma persona y fecha se actualizan, no se duplican.</p>
      </div>
      <ImportForm />
    </div>
  );
}
