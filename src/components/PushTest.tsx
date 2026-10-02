"use client";

import { useActionState, useEffect, useState } from "react";
import { subscribeWeb } from "./PushSetup";

type Result = { label: string; ok: boolean; error: string | null }[] | null;

function Results({ r }: { r: Result }) {
  if (!r) return null;
  if (!r.length) return <p className="text-sm text-amber-800">No hay ningún móvil con los avisos activados: hay que abrir la app en el móvil y pulsar «Activar avisos».</p>;
  return (
    <ul className="space-y-0.5 text-sm">
      {r.map((x, i) => (
        <li key={i} className={x.ok ? "text-emerald-700" : "text-red-700"}>{x.ok ? "✓" : "✗"} {x.label}: {x.ok ? "enviado" : x.error}</li>
      ))}
    </ul>
  );
}

/** RRHH: manda un aviso de prueba a los móviles de una persona y enseña qué ha pasado. */
export function AdminPushTest({ action }: { action: () => Promise<Result> }) {
  const [r, run, pending] = useActionState(async () => action(), null);
  return (
    <form action={run} className="space-y-1">
      <button className="btn btn-sm" disabled={pending}>{pending ? "Enviando…" : "🔔 Enviar aviso de prueba"}</button>
      <Results r={r} />
    </form>
  );
}

/** Trabajador: estado de los avisos en ESTE móvil, activarlos y probarlos. */
export function MyPush({ webKey, action }: { webKey: string | null; action: () => Promise<Result> }) {
  const [perm, setPerm] = useState<string>("cargando");
  const [msg, setMsg] = useState<string | null>(null);
  const [r, run, pending] = useActionState(async () => action(), null);
  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      setPerm(ios ? "ios" : "no");
    } else setPerm(Notification.permission);
  }, []);
  const activate = async () => {
    setMsg(null);
    try {
      if (!webKey) throw new Error("sin clave");
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") return setMsg("Has bloqueado los avisos. Actívalos en los ajustes del móvil para esta app (Notificaciones → Artigot).");
      await subscribeWeb(webKey);
      setMsg("✓ Avisos activados en este móvil. Prueba a enviarte uno.");
    } catch {
      setMsg("No se han podido activar. Cierra la app, ábrela otra vez y vuelve a intentarlo.");
    }
  };
  return (
    <section id="avisos" className="card space-y-2">
      <h2>Avisos en este móvil</h2>
      {perm === "granted" && <p className="text-sm text-emerald-700">✓ Activados. Te llegarán las convocatorias y los mensajes.</p>}
      {perm === "default" && <p className="text-sm text-amber-800">Sin activar: no te enterarás de las convocatorias.</p>}
      {perm === "denied" && <p className="text-sm text-red-700">Bloqueados. Actívalos en los ajustes del móvil: Notificaciones → Artigot (o el navegador) → Permitir.</p>}
      {perm === "ios" && <p className="text-sm text-amber-800">En iPhone: pulsa Compartir → «Añadir a pantalla de inicio», abre Artigot desde ese icono y vuelve aquí.</p>}
      {perm === "no" && <p className="text-sm text-amber-800">Este navegador no admite avisos. Abre la app con Chrome (Android) o desde la pantalla de inicio (iPhone).</p>}
      <div className="flex flex-wrap gap-2">
        {(perm === "default" || perm === "granted") && (
          <button type="button" className="btn btn-sm btn-primary" onClick={activate}>{perm === "granted" ? "Volver a activar" : "Activar avisos"}</button>
        )}
        {perm === "granted" && (
          <form action={run}>
            <button className="btn btn-sm" disabled={pending}>{pending ? "Enviando…" : "Enviarme un aviso de prueba"}</button>
          </form>
        )}
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      <Results r={r} />
    </section>
  );
}
