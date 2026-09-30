import Link from "next/link";
import { PushSetup } from "@/components/PushSetup";
import { requireWorker } from "@/lib/auth";
import { pushConfig } from "@/lib/push";

export const dynamic = "force-dynamic";

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  await requireWorker();
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4 pb-24">
        <PushSetup config={pushConfig()} />
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg text-sm">
          <Link href="/app" className="flex-1 py-3 text-center font-medium text-stone-700">Inicio</Link>
          <Link href="/app/chats" className="flex-1 py-3 text-center font-medium text-stone-700">Chats</Link>
          <Link href="/app/nomina" className="flex-1 py-3 text-center font-medium text-stone-700">Nómina</Link>
          <Link href="/app/perfil" className="flex-1 py-3 text-center font-medium text-stone-700">Perfil</Link>
        </div>
      </nav>
    </div>
  );
}
