import Link from "next/link";
import { PushSetup } from "@/components/PushSetup";
import { redirect } from "next/navigation";
import { requireWorker } from "@/lib/auth";
import { minorStatus } from "@/lib/minors";
import { workerUnread } from "@/lib/workerChat";
import { pushConfig } from "@/lib/push";
import { Logo } from "@/components/Logo";
import { WorkerNav } from "@/components/WorkerNav";
import { OfflineClockSync } from "@/components/OfflineClockSync";

export const dynamic = "force-dynamic";

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const me = await requireWorker();
  // Menores de 16-17 años sin la autorización firmada del tutor (o con menos de 16): no pueden seguir
  const minor = await minorStatus(me);
  if (minor && minor.state !== "authorized") redirect("/autorizacion");
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex justify-center border-b border-stone-200 bg-white py-2">
        <Link href="/app" aria-label="Inicio"><Logo height={30} /></Link>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4 pb-24">
        <PushSetup config={await pushConfig()} />
        <OfflineClockSync />
        {children}
      </main>
      <WorkerNav chats={await workerUnread(me.id)} />
    </div>
  );
}
