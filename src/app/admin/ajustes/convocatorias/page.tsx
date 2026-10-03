import Link from "next/link";
import { getConvocationSettings } from "@/lib/convocation";
import { ConvocationForm } from "./ConvocationForm";

export default async function ConvocationSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Convocatorias sin respuesta</h1>
      </div>
      <ConvocationForm s={await getConvocationSettings()} />
    </div>
  );
}
