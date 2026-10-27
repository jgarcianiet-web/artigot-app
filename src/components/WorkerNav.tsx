"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const TABS = [
  { href: "/app", label: "Inicio" },
  { href: "/app/chats", label: "Chats" },
  { href: "/app/nomina", label: "Nómina" },
  { href: "/app/perfil", label: "Perfil" },
];

/**
 * `chats`: cuántos chats (RRHH y eventos) tienen mensajes sin leer (número en la pestaña «Chats»). Se actualiza
 * solo: al llegar un mensaje nuevo o al leerlo.
 */
export function WorkerNav({ chats = 0 }: { chats?: number }) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource("/api/me/inbox");
    let t: ReturnType<typeof setTimeout> | undefined;
    // Varios avisos seguidos (mensaje + leído) → un solo refresco
    es.addEventListener("inbox", () => {
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 300);
    });
    return () => {
      clearTimeout(t);
      es.close();
    };
  }, [router]);
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg text-sm">
        {TABS.map((t) => {
          const active =
            t.href === "/app"
              ? path === "/app" || path.startsWith("/app/eventos") || path.startsWith("/app/firmar")
              : path.startsWith(t.href) || (t.href === "/app/chats" && path.startsWith("/app/rrhh"));
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 border-t-2 py-3 text-center font-medium ${active ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500"}`}
            >
              {t.label}
              {t.href === "/app/chats" && chats > 0 && <span className="ml-1 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{chats}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
