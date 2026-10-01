import { AdminNav } from "@/components/AdminNav";
import { PushSetup } from "@/components/PushSetup";
import { currentAdmin, requireAdmin } from "@/lib/auth";
import { unreadTotal } from "@/lib/staffChat";
import { db } from "@/lib/db";
import { pendingPhotos } from "@/lib/photo";
import { pushConfig } from "@/lib/push";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const name = await requireAdmin();
  const me = await currentAdmin();
  const unreadMessages = me ? await unreadTotal(me.id) : 0;
  const docsPending = (await db.workerDocument.count({ where: { verified: false, worker: { active: true } } })) + (await pendingPhotos());
  return (
    <div className="min-h-screen lg:flex">
      <AdminNav name={name} logout={logout} badges={{ "/admin/documentos": docsPending, "/admin/mensajes": unreadMessages }} />
      <main className="mx-auto w-full min-w-0 max-w-6xl space-y-4 px-4 py-6 lg:px-8">
        <PushSetup config={await pushConfig()} />
        {children}
      </main>
    </div>
  );
}
