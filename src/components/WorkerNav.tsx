"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app", label: "Inicio" },
  { href: "/app/chats", label: "Chats" },
  { href: "/app/nomina", label: "Nómina" },
  { href: "/app/perfil", label: "Perfil" },
];

export function WorkerNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg text-sm">
        {TABS.map((t) => {
          const active = t.href === "/app" ? path === "/app" || path.startsWith("/app/eventos") || path.startsWith("/app/firmar") : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 border-t-2 py-3 text-center font-medium ${active ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
