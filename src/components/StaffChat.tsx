"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { shrinkImage } from "@/lib/image";
import type { StaffChatMessage, StaffEvent } from "@/lib/staffChat";

const timeFmt = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const dayFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" });

function merge(list: StaffChatMessage[], incoming: StaffChatMessage[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

type Member = { id: string; name: string; lastReadAt: string };

/** Conversación del chat interno de RRHH (tipo WhatsApp). */
export function StaffChat({ roomId, meId, initial, members, group }: { roomId: string; meId: string; initial: StaffChatMessage[]; members: Member[]; group: boolean }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [reads, setReads] = useState(() => Object.fromEntries(members.map((m) => [m.id, m.lastReadAt])));
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const base = `/api/rrhh-chat/${roomId}`;

  const markRead = useCallback(() => {
    if (document.visibilityState === "visible") fetch(`${base}/read`, { method: "POST" }).catch(() => {});
  }, [base]);

  useEffect(() => {
    const es = new EventSource(`${base}/stream`);
    es.addEventListener("staff", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as StaffEvent;
      if (ev.type === "message") {
        setMessages((prev) => merge(prev, [ev.message]));
        if (ev.message.adminId !== meId) markRead();
        router.refresh(); // actualiza la lista de conversaciones
      } else setReads((r) => ({ ...r, [ev.adminId]: ev.at > (r[ev.adminId] ?? "") ? ev.at : r[ev.adminId] }));
    });
    es.onopen = () => {
      setOnline(true);
      fetch(`${base}/messages`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list: StaffChatMessage[]) => setMessages((prev) => merge(prev, list)))
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
  }, [base, markRead, meId, router]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function post(init: RequestInit) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${base}/messages`, { method: "POST", ...init });
      if (!res.ok) throw new Error(res.status === 400 ? await res.text() : "");
      const m: StaffChatMessage = await res.json();
      setMessages((prev) => merge(prev, [m]));
      setText("");
    } catch (e) {
      setError((e as Error).message || "No se ha podido enviar. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  const send = () => {
    const body = text.trim();
    if (body && !sending) post({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
  };
  const sendPhoto = async (file: File) => {
    const form = new FormData();
    form.set("file", await shrinkImage(file));
    form.set("body", text.trim());
    post({ body: form });
  };

  const others = members.filter((m) => m.id !== meId);
  /** ✓ enviado · ✓✓ leído por todos (en grupos, al pasar el ratón se ve quién lo ha leído) */
  const ticks = (m: StaffChatMessage) => {
    const readBy = others.filter((o) => (reads[o.id] ?? "") >= m.createdAt);
    const all = others.length > 0 && readBy.length === others.length;
    const title = readBy.length ? `Leído por ${readBy.map((o) => o.name).join(", ")}` : "Enviado";
    return <span title={title} className={all ? "text-sky-600" : "text-stone-400"}>{readBy.length ? "✓✓" : "✓"}</span>;
  };
  let lastDay = "";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stone-200 bg-[#efeae2]">
      {!online && <div className="bg-amber-100 px-3 py-1 text-center text-xs text-amber-800">Reconectando…</div>}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mx-auto mt-6 max-w-xs rounded-lg bg-white/70 p-3 text-center text-sm text-stone-600">Aún no hay mensajes. Solo lo ve RRHH.</p>
        )}
        {messages.map((m) => {
          const d = new Date(m.createdAt);
          const day = dayFmt.format(d);
          const showDay = day !== lastDay;
          lastDay = day;
          const own = m.adminId === meId;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-2 text-center">
                  <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs text-stone-600 shadow-sm first-letter:uppercase">{day}</span>
                </div>
              )}
              <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${own ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"}`}>
                  {!own && group && <div className="text-xs font-semibold text-emerald-700">{m.authorName}</div>}
                  {m.fileId && (
                    <a href={`/api/files/${m.fileId}`} target="_blank" className="-mx-1 my-1 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${m.fileId}`} alt="Foto" loading="lazy" className="max-h-64 rounded-md object-cover" />
                    </a>
                  )}
                  {m.body && <div className="break-words whitespace-pre-wrap">{m.body}</div>}
                  <div className="flex justify-end gap-1 text-[10px] text-stone-500">
                    {timeFmt.format(d)}
                    {own && ticks(m)}
                  </div>
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
          maxLength={4000}
          placeholder="Escribe un mensaje"
          aria-label="Mensaje"
          className="input max-h-32 min-h-10 flex-1 resize-none rounded-2xl text-base sm:text-sm"
        />
        <button className="btn btn-primary h-10 rounded-full px-4" disabled={sending || !text.trim()}>Enviar</button>
      </form>
    </div>
  );
}

/** Refresca la lista de conversaciones cuando llega un mensaje nuevo. */
export function InboxRefresh() {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource("/api/rrhh-chat/inbox");
    es.addEventListener("inbox", () => router.refresh());
    return () => es.close();
  }, [router]);
  return null;
}
