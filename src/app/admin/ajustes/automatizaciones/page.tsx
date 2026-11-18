import Link from "next/link";
import { getAutomation } from "@/lib/automation";
import { mailEnabled } from "@/lib/mail";
import { accessPending, accessWithoutDni } from "@/lib/automationJobs";
import { AutomationForm, SendA3Now, SendAccessNow } from "./AutomationForm";

export default async function AutomationPage() {
  const s = await getAutomation();
  const [pending, noDni] = await Promise.all([accessPending(s.accessEmail.resendDays).then((p) => p.length), accessWithoutDni()]);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Automatizaciones</h1>
        <p className="text-sm text-stone-500">Lo que la app hace sola con los eventos y el personal, para que RRHH solo revise.</p>
      </div>
      <AutomationForm s={s} mail={mailEnabled()} />
      <SendA3Now mail={mailEnabled()} />
      <SendAccessNow mail={mailEnabled()} pending={pending} noDni={noDni} />
    </div>
  );
}
