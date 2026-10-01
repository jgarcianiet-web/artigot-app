"use client";

import { useEffect, useState } from "react";

/**
 * Activa las notificaciones en este dispositivo:
 *  - Dentro de la app nativa (Capacitor): pide permiso y registra el token FCM (Android) o APNs (iOS).
 *  - En el navegador / web app instalada: Web Push con service worker.
 */

type PushConfig = { webPublicKey: string | null; fcm: boolean; apns: boolean };

const register = (body: object) =>
  fetch("/api/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function subscribeWeb(key: string) {
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const json = sub.toJSON();
  await register({ kind: "web", token: json.endpoint, keys: json.keys });
}

/** Dentro de la app nativa: los plugins se cargan bajo demanda (en el navegador no se descargan). */
async function setupNative(config: PushConfig) {
  const { Capacitor } = await import("@capacitor/core");
  const platform = Capacitor.getPlatform();
  if ((platform === "android" && !config.fcm) || (platform === "ios" && !config.apns)) return false;
  const { PushNotifications: push } = await import("@capacitor/push-notifications");
  await push.removeAllListeners();
  await push.addListener("registration", (t) => register({ kind: platform === "ios" ? "apns" : "fcm", token: t.value }));
  await push.addListener("registrationError", (e) => console.error("push nativo", e.error));
  await push.addListener("pushNotificationActionPerformed", (a) => {
    const url = (a.notification.data as { url?: string } | undefined)?.url;
    if (url) window.location.href = url;
  });
  if (platform === "android") {
    await push.createChannel({ id: "avisos", name: "Avisos", importance: 5, sound: "default", vibration: true });
  }
  let perm = await push.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await push.requestPermissions();
  if (perm.receive === "granted") await push.register();
  return true;
}

const isNativeApp = () =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

type State = "hidden" | "ask" | "denied" | "ios-install";

export function PushSetup({ config }: { config: PushConfig }) {
  const [state, setState] = useState<State>("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNativeApp()) {
      setupNative(config).catch((e) => console.error("push nativo", e));
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!("PushManager" in window) || !("Notification" in window)) {
      // En iPhone, las notificaciones web solo funcionan con la web app añadida a la pantalla de inicio
      if (ios && !standalone) setState("ios-install");
      return;
    }
    if (!config.webPublicKey) return;
    if (Notification.permission === "granted") subscribeWeb(config.webPublicKey).catch(() => {});
    else setState(Notification.permission === "denied" ? "denied" : "ask");
  }, [config.webPublicKey, config.fcm, config.apns]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "hidden") return null;

  if (state === "ios-install") {
    return (
      <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
        Para recibir avisos en el iPhone sin la app: pulsa <strong>Compartir</strong> →{" "}
        <strong>Añadir a pantalla de inicio</strong> y abre Artigot desde ese icono.
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Los avisos están bloqueados en este navegador. Actívalos en los ajustes del sitio para enterarte de los mensajes al momento.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
      <span>Activa los avisos para enterarte al momento de convocatorias y mensajes.</span>
      <button
        className="btn btn-primary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if ((await Notification.requestPermission()) === "granted") {
              await subscribeWeb(config.webPublicKey!);
              setState("hidden");
            } else setState("denied");
          } finally {
            setBusy(false);
          }
        }}
      >
        Activar avisos
      </button>
    </div>
  );
}

/** Botón «Activar avisos» para la bienvenida guiada (mismo proceso que el aviso de arriba). */
export function EnablePushButton({ config, onDone }: { config: PushConfig; onDone?: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            if (isNativeApp()) {
              if (!(await setupNative(config))) return setMsg("Los avisos de la app aún no están activados: RRHH tiene que terminar de configurarlos. Mientras tanto, te avisamos por WhatsApp o email.");
            } else {
              const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
              if (!("PushManager" in window) || !("Notification" in window)) {
                setMsg(ios ? "En iPhone: pulsa Compartir → «Añadir a pantalla de inicio», abre Artigot desde ese icono y vuelve aquí." : "Este navegador no permite avisos.");
                return;
              }
              if (!config.webPublicKey) return setMsg("Los avisos aún no están configurados en el servidor.");
              if ((await Notification.requestPermission()) !== "granted") return setMsg("Has bloqueado los avisos. Actívalos en los ajustes del navegador para este sitio.");
              await subscribeWeb(config.webPublicKey);
            }
            setTimeout(() => onDone?.(), 800);
          } catch {
            setMsg("No se han podido activar. Inténtalo de nuevo.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Activando…" : "Activar avisos"}
      </button>
      {msg && <p className="text-xs text-stone-600">{msg}</p>}
    </div>
  );
}
