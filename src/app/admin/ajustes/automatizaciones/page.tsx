import Link from "next/link";
import { getAutomation } from "@/lib/automation";
import { mailEnabled } from "@/lib/mail";
import { AutomationForm, SendA3Now } from "./AutomationForm";

export default async function AutomationPage() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Automatizaciones</h1>
        <p className="text-sm text-stone-500">Lo que la app hace sola con los eventos y el personal, para que RRHH solo revise.</p>
      </div>
      <AutomationForm s={await getAutomation()} mail={mailEnabled()} />
      <SendA3Now mail={mailEnabled()} />
    </div>
  );
}
