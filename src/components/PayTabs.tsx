"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/liquidacion", label: "Horas" },
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/jornada", label: "Registro de jornada" },
];

/** Pestañas de «Horas y pagos»: liquidación, pagos por quincena y registro de jornada. */
export function PayTabs() {
  const path = usePathname();
  return (
    <nav className="-mt-1 mb-1 flex gap-1 border-b border-stone-200 text-sm">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} className={`-mb-px border-b-2 px-3 py-2 ${on ? "border-stone-900 font-medium text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
