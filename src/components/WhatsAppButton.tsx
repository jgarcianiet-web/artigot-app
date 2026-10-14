"use client";

import { waLink, waNumber } from "@/lib/whatsapp";

const KEY = "wa-desktop";

/**
 * Abre la conversación de WhatsApp con esa persona y el mensaje ya escrito, sin pasar por la página intermedia de wa.me:
 * - En el móvil, la app de WhatsApp.
 * - En el ordenador, WhatsApp de escritorio si está instalado; si no, WhatsApp Web. Lo que funcione se recuerda.
 */
export function openWhatsApp(phone: string, text: string) {
  const n = waNumber(phone);
  if (!n) return;
  const q = `phone=${n}&text=${encodeURIComponent(text)}`;
  const web = () => {
    const url = `https://web.whatsapp.com/send?${q}`;
    if (!window.open(url, "whatsapp")) window.location.href = url; // si el navegador bloquea la ventana nueva
  };
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.location.href = `whatsapp://send?${q}`;
    return;
  }
  let pref: string | null = null;
  try { pref = localStorage.getItem(KEY); } catch {}
  if (pref === "web") return void web();
  // Intenta la app de escritorio: si se abre, el navegador pierde el foco (o pregunta si abrirla)
  let opened = false;
  const onBlur = () => { opened = true; };
  window.addEventListener("blur", onBlur, { once: true });
  window.location.href = `whatsapp://send?${q}`;
  setTimeout(() => {
    window.removeEventListener("blur", onBlur);
    try { localStorage.setItem(KEY, opened ? "app" : "web"); } catch {}
    if (!opened) web();
  }, 1200);
}

export function WhatsAppButton({
  phone, text, className = "btn btn-sm", title = "Abre WhatsApp con el mensaje ya escrito", onOpen, children,
}: { phone: string | null; text: string; className?: string; title?: string; onOpen?: () => void; children: React.ReactNode }) {
  const href = waLink(phone, text);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        onOpen?.();
        openWhatsApp(phone!, text);
      }}
    >
      {children}
    </a>
  );
}
