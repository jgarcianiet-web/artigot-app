import { AdminNav } from "@/components/AdminNav";
import { PushSetup } from "@/components/PushSetup";
import { requireAdmin } from "@/lib/auth";
import { pushConfig } from "@/lib/push";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const name = await requireAdmin();
  return (
    <div className="min-h-screen lg:flex">
      <AdminNav name={name} logout={logout} />
      <main className="mx-auto w-full min-w-0 max-w-6xl space-y-4 px-4 py-6 lg:px-8">
        <PushSetup config={pushConfig()} />
        {children}
      </main>
    </div>
  );
}
