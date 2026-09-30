import Link from "next/link";
import { DEFAULT_TEMPLATE, getCompany } from "@/lib/contracts";
import { CompanyForm } from "./CompanyForm";

export default async function CompanySettings() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Empresa y contratos</h1>
        <p className="text-sm text-stone-500">Datos de la empresa y plantilla del documento de condiciones que firma el personal de cada evento.</p>
      </div>
      <CompanyForm company={await getCompany()} defaultTemplate={DEFAULT_TEMPLATE} />
    </div>
  );
}
