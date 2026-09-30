import Link from "next/link";
import { getPaySettings } from "@/lib/pay";
import { PaySettingsForm } from "./PaySettingsForm";

export default async function PaySettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Pagos y remesas</h1>
      </div>
      <PaySettingsForm s={await getPaySettings()} />
    </div>
  );
}
