"use client";

import { useState } from "react";

/** Abre WhatsApp con las instrucciones y apunta que ya se le ha pedido. */
export function AskButton({ href, action, again }: { href: string; action: () => Promise<void>; again: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      className={`btn btn-sm ${done ? "opacity-60" : "border-emerald-300 text-emerald-800"}`}
      onClick={() => {
        setDone(true);
        action().catch(() => {});
      }}
    >
      {done ? "✓ Enviado" : again ? "WhatsApp otra vez" : "WhatsApp"}
    </a>
  );
}
