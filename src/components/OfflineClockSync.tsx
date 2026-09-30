"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { clockOffline } from "@/app/app/actions";
import { loadQueue, QUEUE_EVENT, removeQueued, type QueuedClock } from "@/lib/clockQueue";

/**
 * Envía los fichajes guardados sin cobertura en cuanto hay conexión (al abrir la app, al volver la
 * señal y cada 20 s). También registra el service worker que guarda la app para abrirla sin señal.
 */
export function OfflineClockSync() {
  const router = useRouter();
  const [pending, setPending] = useState<QueuedClock[]>([]);
  const [messages, setMessages] = useState<{ ok: boolean; text: string }[]>([]);
  const busy = useRef(false);

  const flush = useCallback(async () => {
    const q = loadQueue().sort((a, b) => a.capturedAt - b.capturedAt);
    setPending(q);
    if (busy.current || !q.length || !navigator.onLine) return;
    busy.current = true;
    let changed = false;
    try {
      for (const item of q) {
        let r;
        try {
          r = await clockOffline(item.assignmentId, item.kind, { lat: item.lat, lng: item.lng, accuracy: item.accuracy }, item.capturedAt, Date.now());
        } catch {
          break; // sigue sin conexión: se reintenta más tarde
        }
        if (r.done) {
          removeQueued(item.id);
          changed = true;
          setMessages((m) => [...m, { ok: r.ok, text: r.message }]);
        }
      }
    } finally {
      busy.current = false;
      setPending(loadQueue());
      if (changed) router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    flush();
    const onChange = () => setPending(loadQueue());
    window.addEventListener("online", flush);
    window.addEventListener(QUEUE_EVENT, onChange);
    const t = setInterval(flush, 20_000);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener(QUEUE_EVENT, onChange);
      clearInterval(t);
    };
  }, [flush]);

  if (!pending.length && !messages.length) return null;
  return (
    <div className="space-y-2">
      {pending.length > 0 && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <span>📶 {pending.length === 1 ? "1 fichaje guardado sin cobertura" : `${pending.length} fichajes guardados sin cobertura`}. Se enviará solo al recuperar la señal.</span>
          <button type="button" className="btn btn-sm shrink-0" onClick={flush}>Enviar ahora</button>
        </div>
      )}
      {messages.map((m, i) => (
        <p key={i} role="status" className={`rounded-lg p-2 text-sm ${m.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {m.text}
        </p>
      ))}
    </div>
  );
}
