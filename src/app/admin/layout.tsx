import Link from "next/link";
import { PushSetup } from "@/components/PushSetup";
import { requireAdmin } from "@/lib/auth";
import { pushConfig } from "@/lib/push";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/calendario", label: "Calendario" },
  { href: "/admin/eventos", label: "Eventos" },
  { href: "/admin/chats", label: "Chats" },
  { href: "/admin/incidencias", label: "Incidencias" },
  { href: "/admin/personal", label: "Personal" },
  { href: "/admin/liquidacion", label: "Liquidación" },
  { href: "/admin/tarifas", label: "Tarifas" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const name = await requireAdmin();
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-semibold text-brand-700">Artigot Personal</Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-stone-700 hover:bg-stone-100">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="ml-auto flex items-center gap-3">
            <span className="text-sm text-stone-500">{name}</span>
            <button className="text-sm text-stone-500 hover:text-stone-800">Salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <PushSetup config={pushConfig()} />
        {children}
      </main>
    </div>
  );
}
