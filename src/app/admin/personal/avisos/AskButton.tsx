"use client";

import { useState } from "react";
import { WhatsAppButton } from "@/components/WhatsAppButton";

/** Abre WhatsApp con las instrucciones y apunta que ya se le ha pedido. */
export function AskButton({ phone, text, action, again }: { phone: string; text: string; action: () => Promise<void>; again: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <WhatsAppButton
      phone={phone}
      text={text}
      className={`btn btn-sm ${done ? "opacity-60" : "border-emerald-300 text-emerald-800"}`}
      onOpen={() => {
        setDone(true);
        action().catch(() => {});
      }}
    >
      {done ? "✓ Enviado" : again ? "WhatsApp otra vez" : "WhatsApp"}
    </WhatsAppButton>
  );
}
