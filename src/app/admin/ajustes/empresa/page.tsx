import Link from "next/link";
import { getCompany } from "@/lib/contracts";
import { CompanyForm } from "./CompanyForm";
import { PrivacyForm } from "./PrivacyForm";
import { db } from "@/lib/db";
import { DEFAULT_PRIVACY_TEMPLATE, getPrivacy } from "@/lib/privacy";

export default async function CompanySettings() {
  const privacy = await getPrivacy();
  const signed = (await db.contract.findMany({ where: { kind: "RGPD", version: privacy.version, signedAt: { not: null } }, select: { workerId: true }, distinct: ["workerId"] })).length;
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Empresa y protección de datos</h1>
        <p className="text-sm text-stone-500">Datos de la empresa (para las remesas y los documentos) y cláusula de protección de datos.</p>
      </div>
      <CompanyForm company={await getCompany()} />
      <PrivacyForm email={privacy.email} template={privacy.template} version={privacy.version} signed={signed} defaultTemplate={DEFAULT_PRIVACY_TEMPLATE} />
    </div>
  );
}
