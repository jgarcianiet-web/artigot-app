import Link from "next/link";
import { PushSetup } from "@/components/PushSetup";
import { requireWorker } from "@/lib/auth";
import { pushConfig } from "@/lib/push";
import { Logo } from "@/components/Logo";
import { WorkerNav } from "@/components/WorkerNav";
import { OfflineClockSync } from "@/components/OfflineClockSync";

export const dynamic = "force-dynamic";

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  await requireWorker();
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex justify-center border-b border-stone-200 bg-white py-2">
        <Link href="/app" aria-label="Inicio"><Logo height={30} /></Link>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4 pb-24">
        <PushSetup config={pushConfig()} />
        <OfflineClockSync />
        {children}
      </main>
      <WorkerNav />
    </div>
  );
}
