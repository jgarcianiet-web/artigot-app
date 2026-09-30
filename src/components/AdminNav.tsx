"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

type Item = { href: string; label: string };
const GROUPS: { title?: string; items: Item[] }[] = [
  { items: [{ href: "/admin", label: "Panel" }, { href: "/admin/calendario", label: "Calendario" }] },
  { title: "Eventos", items: [{ href: "/admin/eventos", label: "Eventos" }, { href: "/admin/chats", label: "Chats" }, { href: "/admin/incidencias", label: "Incidencias" }] },
  { title: "Personal", items: [{ href: "/admin/personal", label: "Personal" }, { href: "/admin/sondeos", label: "Sondeos" }, { href: "/admin/candidatos", label: "Candidatos" }, { href: "/admin/altas", label: "Altas y bajas" }] },
  { title: "Nóminas", items: [{ href: "/admin/liquidacion", label: "Liquidación" }, { href: "/admin/pagos", label: "Pagos" }, { href: "/admin/jornada", label: "Registro de jornada" }, { href: "/admin/informes", label: "Informes" }] },
  { items: [{ href: "/admin/registro", label: "Registro de cambios" }, { href: "/admin/ajustes", label: "Ajustes" }] },
];

// Rutas que viven bajo Ajustes aunque no empiecen por /admin/ajustes
const SETTINGS = ["/admin/fincas", "/admin/clientes", "/admin/plantillas", "/admin/tarifas", "/admin/usuarios"];

function isActive(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  if (href === "/admin/ajustes" && SETTINGS.some((s) => path.startsWith(s))) return true;
  return path === href || path.startsWith(`${href}/`);
}

function Links({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5 text-sm">
      {GROUPS.map((g, i) => (
        <div key={i}>
          {g.title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{g.title}</div>}
          <ul className="space-y-0.5">
            {g.items.map((n) => {
              const active = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={`block rounded-md px-3 py-1.5 ${active ? "bg-stone-900 font-medium text-white" : "text-stone-700 hover:bg-stone-100"}`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Account({ name, logout }: { name: string; logout: () => Promise<void> }) {
  return (
    <form action={logout} className="flex items-center justify-between gap-2 border-t border-stone-200 pt-3 text-sm">
      <span className="truncate text-stone-600">{name}</span>
      <button className="text-stone-500 hover:text-stone-900">Salir</button>
    </form>
  );
}

export function AdminNav({ name, logout }: { name: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Ordenador: barra lateral fija */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r border-stone-200 bg-white px-3 py-5 lg:flex">
        <Link href="/admin" className="px-3" aria-label="Panel"><Logo height={44} /></Link>
        <div className="flex-1"><Links path={path} /></div>
        <Account name={name} logout={logout} />
      </aside>

      {/* Móvil y tablet: barra superior con menú desplegable */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-2.5 lg:hidden">
        <Link href="/admin" aria-label="Panel"><Logo height={32} /></Link>
        <button className="btn" aria-expanded={open} aria-controls="admin-menu" onClick={() => setOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          Menú
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setOpen(false)} />
          <div id="admin-menu" className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto bg-white px-3 py-4 shadow-xl">
            <div className="flex items-center justify-between px-3">
              <Logo height={30} />
              <button className="text-2xl leading-none text-stone-500" aria-label="Cerrar menú" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="flex-1"><Links path={path} onNavigate={() => setOpen(false)} /></div>
            <Account name={name} logout={logout} />
          </div>
        </div>
      )}
    </>
  );
}
