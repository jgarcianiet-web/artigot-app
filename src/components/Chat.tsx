"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat";
import { shrinkImage } from "@/lib/image";

type Me = { workerId: string | null };

const timeFmt = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const dayFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" });

function merge(list: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function Chat({
  eventId,
  initial,
  me,
  className = "",
}: {
  eventId: string;
  initial: ChatMessage[];
  me: Me;
  className?: string;
}) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const base = `/api/chat/${eventId}`;

  const markRead = useCallback(() => {
    if (document.visibilityState === "visible") fetch(`${base}/read`, { method: "POST" }).catch(() => {});
  }, [base]);

  // Tiempo real: Server-Sent Events. Al (re)conectar se recupera lo que se haya podido perder.
  useEffect(() => {
    const es = new EventSource(`${base}/stream`);
    es.addEventListener("message", (e) => {
      setMessages((prev) => merge(prev, [JSON.parse((e as MessageEvent).data)]));
      markRead();
    });
    es.onopen = () => {
      setOnline(true);
      fetch(`${base}/messages`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list: ChatMessage[]) => setMessages((prev) => merge(prev, list)))
        .catch(() => {});
    };
    es.onerror = () => setOnline(false);
    const onVisible = () => markRead();
    document.addEventListener("visibilitychange", onVisible);
    markRead();
    return () => {
      es.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [base, markRead]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function post(init: RequestInit, clearText: boolean) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${base}/messages`, { method: "POST", ...init });
      if (!res.ok) throw new Error(res.status === 400 ? await res.text() : "");
      const m: ChatMessage = await res.json();
      setMessages((prev) => merge(prev, [m]));
      if (clearText) setText("");
    } catch (e) {
      setError((e as Error).message || "No se ha podido enviar. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    await post({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }, true);
  }

  async function sendPhoto(file: File) {
    const form = new FormData();
    form.set("file", await shrinkImage(file));
    form.set("body", text.trim());
    await post({ body: form }, true);
  }

  function sendLocation() {
    if (!("geolocation" in navigator)) return setError("Este dispositivo no permite compartir la ubicación.");
    setSending(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const form = new FormData();
        form.set("lat", String(p.coords.latitude));
        form.set("lng", String(p.coords.longitude));
        form.set("body", text.trim());
        post({ body: form }, true);
      },
      () => {
        setSending(false);
        setError("No se ha podido obtener tu ubicación. Revisa los permisos.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const mine = (m: ChatMessage) => (me.workerId ? m.workerId === me.workerId : m.fromAdmin);
  let lastDay = "";

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-[#efeae2] ${className}`}>
      {!online && (
        <div className="bg-amber-100 px-3 py-1 text-center text-xs text-amber-800">Reconectando…</div>
      )}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mx-auto mt-6 max-w-xs rounded-lg bg-white/70 p-3 text-center text-sm text-stone-600">
            Aún no hay mensajes. Aquí se coordina el evento: RRHH y el personal confirmado.
          </p>
        )}
        {messages.map((m) => {
          const d = new Date(m.createdAt);
          const day = dayFmt.format(d);
          const showDay = day !== lastDay;
          lastDay = day;
          const own = mine(m);
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-2 text-center">
                  <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs text-stone-600 shadow-sm first-letter:uppercase">{day}</span>
                </div>
              )}
              <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${
                    own ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"
                  }`}
                >
                  {!own && (
                    <div className={`text-xs font-semibold ${m.fromAdmin ? "text-brand-700" : "text-emerald-700"}`}>
                      {m.authorName}
                    </div>
                  )}
                  {m.fileId && (
                    <a href={`/api/files/${m.fileId}`} target="_blank" className="-mx-1 my-1 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${m.fileId}`} alt="Foto" loading="lazy" className="max-h-64 rounded-md object-cover" />
                    </a>
                  )}
                  {m.lat != null && m.lng != null && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`}
                      target="_blank"
                      className="my-1 flex items-center gap-1 font-medium text-brand-700 underline"
                    >
                      📍 Ver ubicación
                    </a>
                  )}
                  {m.body && <div className="break-words whitespace-pre-wrap">{m.body}</div>}
                  <div className="text-right text-[10px] text-stone-500">{timeFmt.format(d)}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <div className="bg-red-50 px-3 py-1 text-xs text-red-700">{error}</div>}
      <form
        className="flex items-end gap-2 border-t border-stone-200 bg-stone-50 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className={`btn h-10 w-10 shrink-0 cursor-pointer rounded-full p-0 ${sending ? "pointer-events-none opacity-50" : ""}`} title="Enviar foto">
          📷
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Enviar foto"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) sendPhoto(f);
            }}
          />
        </label>
        <button type="button" className="btn h-10 w-10 shrink-0 rounded-full p-0" title="Compartir mi ubicación" disabled={sending} onClick={sendLocation}>
          📍
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Escribe un mensaje"
          aria-label="Mensaje"
          className="input max-h-32 min-h-10 flex-1 resize-none rounded-2xl text-base sm:text-sm"
        />
        <button className="btn btn-primary h-10 rounded-full px-4" disabled={sending || !text.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
