import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { GroupForm } from "../GroupForm";
import { pickableWorkers } from "../workers";

export default async function NewGroup() {
  if (!(await currentAdmin())) redirect("/login");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/mensajes?ver=personal" className="btn btn-sm shrink-0">‹ Mensajes</Link>
        <h1>Nuevo grupo con el personal</h1>
      </div>
      <p className="text-sm text-stone-500">Les llega el aviso al móvil con cada mensaje de RRHH. Lo veis y gestionáis todos los de RRHH.</p>
      <GroupForm workers={await pickableWorkers()} />
    </div>
  );
}
