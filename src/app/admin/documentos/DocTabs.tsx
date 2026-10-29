import Link from "next/link";
import { db } from "@/lib/db";

/** Pestañas de Documentos: lo que sube el personal y lo que RRHH envía a firmar. */
export async function DocTabs({ active, review, expiring }: { active: "revisar" | "caducan" | "firmar"; review?: number; expiring?: number }) {
  const pendingSign = (await db.contract.count({ where: { kind: "DOCUMENTO", signedAt: null } })) + (await db.externalSigner.count({ where: { signedAt: null } }));
  const tab = (key: typeof active, href: string, label: string) => (
    <Link href={href} className={`rounded-md px-3 py-1.5 ${active === key ? "bg-stone-900 text-white" : "bg-stone-100 hover:bg-stone-200"}`}>{label}</Link>
  );
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {tab("revisar", "/admin/documentos", `Por revisar${review != null ? ` (${review})` : ""}`)}
      {tab("caducan", "/admin/documentos?ver=caducan", `Caducados o a punto${expiring != null ? ` (${expiring})` : ""}`)}
      {tab("firmar", "/admin/documentos/firmar", `Para firmar (${pendingSign} sin firmar)`)}
    </nav>
  );
}
