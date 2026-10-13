"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clock, type ClockResult } from "@/app/app/actions";
import { enqueueClock, loadQueue, QUEUE_EVENT } from "@/lib/clockQueue";
import { distanceMeters, hhmm, MAX_ACCURACY_M, reasonQuestion, unusualClock } from "@/lib/clockRules";

type Position = { lat: number; lng: number; accuracy: number };

const isNativeApp = () =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Posición actual con alta precisión: GPS nativo en la app, API del navegador en la web. Funciona sin datos móviles. */
async function currentPosition(): Promise<Position> {
  const timeout = navigator.onLine ? 20_000 : 45_000; // sin datos el GPS tarda más en fijar la posición
  if (isNativeApp()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      const req = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (req.location !== "granted") throw new Error("denied");
    }
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout, maximumAge: 0 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
  }
  if (!("geolocation" in navigator)) throw new Error("unsupported");
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable")),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    ),
  );
}

const LOCATION_ERRORS: Record<string, string> = {
  denied: "Necesitamos tu ubicación para fichar. Permite el acceso a la ubicación en los ajustes del móvil y vuelve a intentarlo.",
  unsupported: "Este dispositivo no permite obtener la ubicación.",
  unavailable: "No se ha podido obtener tu ubicación. Activa el GPS e inténtalo de nuevo.",
};

/** Si el servidor no responde en este tiempo, se trata como falta de cobertura. */
const SERVER_TIMEOUT_MS = 12_000;

/** opensAt/closesAt: horario normal (fuera de él hay que dar el motivo); firstAt/lastAt: límites para fichar. */
export type ClockRules = { opensAt: string; closesAt: string; firstAt: string; lastAt: string; lat: number | null; lng: number | null; radius: number };

/** Comprobación previa en el móvil (el servidor vuelve a comprobarlo todo al recibir el fichaje). */
function precheck(rules: ClockRules, pos: Position, at: Date): string | null {
  if (at < new Date(rules.firstAt)) return `Todavía es pronto para fichar en este evento: se puede desde las ${hhmm(new Date(rules.firstAt))}.`;
  if (at > new Date(rules.lastAt)) return "El fichaje de este evento ya está cerrado. Habla con RRHH para que te apunten la hora.";
  if (rules.lat == null || rules.lng == null) return "RRHH aún no ha fijado la ubicación de este evento. Avísales para poder fichar.";
  if (!(pos.accuracy > 0) || pos.accuracy > MAX_ACCURACY_M) return `La señal de ubicación es poco precisa (±${Math.round(pos.accuracy)} m). Sal a un lugar abierto e inténtalo de nuevo.`;
  const d = distanceMeters(pos, { lat: rules.lat, lng: rules.lng });
  if (d > rules.radius) {
    const km = d >= 1000 ? `${(d / 1000).toFixed(1).replace(".", ",")} km` : `${d} m`;
    return `Estás a ${km} del evento. Tienes que estar a menos de ${rules.radius} m para fichar.`;
  }
  return null;
}

export function ClockButtons({
  assignmentId,
  checkIn,
  checkOut,
  windowText,
  rules,
}: {
  assignmentId: string;
  checkIn: string | null;
  checkOut: string | null;
  windowText: string;
  rules: ClockRules;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [result, setResult] = useState<ClockResult | null>(null);
  const [queued, setQueued] = useState<{ in?: string; out?: string }>({});
  // Fichaje fuera del horario normal: se pide el motivo antes de registrarlo
  const [ask, setAsk] = useState<{ kind: "in" | "out"; position: Position; at: number; question: string } | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const read = () => {
      const q = loadQueue().filter((x) => x.assignmentId === assignmentId);
      const t = (k: "in" | "out") => {
        const x = q.find((y) => y.kind === k);
        return x ? hhmm(new Date(x.capturedAt)) : undefined;
      };
      setQueued({ in: t("in"), out: t("out") });
    };
    read();
    window.addEventListener(QUEUE_EVENT, read);
    return () => window.removeEventListener(QUEUE_EVENT, read);
  }, [assignmentId]);

  function saveOffline(kind: "in" | "out", position: Position, at: number, why?: string) {
    if (!enqueueClock({ assignmentId, kind, ...position, capturedAt: at, ...(why && { reason: why }) })) {
      setResult({
        ok: false,
        message: `No hemos podido guardar tu ${kind === "in" ? "entrada" : "salida"} en este móvil (sin espacio o en modo privado). No está registrada: avisa ahora a tu maître o a RRHH con la hora (${hhmm(new Date(at))}) para que la apunten.`,
      });
      return;
    }
    setResult({
      ok: true,
      message: `Sin cobertura: ${kind === "in" ? "entrada" : "salida"} guardada a las ${hhmm(new Date(at))}. Se enviará sola en cuanto vuelva la señal; no cierres sesión.`,
    });
  }

  const windowOf = () => ({ opensAt: new Date(rules.opensAt), closesAt: new Date(rules.closesAt) });

  async function doClock(kind: "in" | "out") {
    setBusy(kind);
    setResult(null);
    try {
      let position: Position;
      try {
        position = await currentPosition();
      } catch (e) {
        setResult({ ok: false, message: LOCATION_ERRORS[(e as Error).message] ?? LOCATION_ERRORS.unavailable });
        return;
      }
      const at = Date.now();
      const problem = precheck(rules, position, new Date(at));
      if (problem) {
        setResult({ ok: false, message: problem });
        return;
      }
      // Fuera del horario normal: antes de fichar hay que escribir el motivo
      const unusual = unusualClock(kind, new Date(at), windowOf());
      if (unusual) {
        setReason("");
        setAsk({ kind, position, at, question: reasonQuestion(kind, unusual, windowOf()) });
        return;
      }
      await send(kind, position, at);
    } finally {
      setBusy(null);
    }
  }

  async function send(kind: "in" | "out", position: Position, at: number, why?: string) {
    if (!navigator.onLine) {
      saveOffline(kind, position, at, why);
      setAsk(null);
      return;
    }
    let r: ClockResult;
    try {
      r = await Promise.race([
        clock(assignmentId, kind, position, why),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), SERVER_TIMEOUT_MS)),
      ]);
    } catch {
      // Sin respuesta del servidor: se guarda en el móvil (si luego resulta que sí llegó, no se duplica)
      saveOffline(kind, position, at, why);
      setAsk(null);
      return;
    }
    if (r.needReason) {
      // El servidor (con su hora) ve que está fuera del horario normal: hay que dar el motivo
      setAsk({ kind, position, at, question: r.needReason });
      return;
    }
    setAsk(null);
    setResult(r);
    if (r.ok) router.refresh();
  }

  async function sendWithReason(e: React.FormEvent) {
    e.preventDefault();
    if (!ask || reason.trim().length < 3) return;
    setBusy(ask.kind);
    try {
      await send(ask.kind, ask.position, ask.at, reason.trim());
    } finally {
      setBusy(null);
    }
  }

  const inDone = checkIn ?? (queued.in ? `${queued.in} ⏳` : null);
  const outDone = checkOut ?? (queued.out ? `${queued.out} ⏳` : null);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-success w-full py-4 text-base" disabled={!!inDone || busy !== null || !!ask} onClick={() => doClock("in")}>
          {inDone ? `Entrada ${inDone}` : busy === "in" ? "Localizando…" : "📍 Fichar entrada"}
        </button>
        <button type="button" className="btn btn-primary w-full py-4 text-base" disabled={!inDone || !!outDone || busy !== null || !!ask} onClick={() => doClock("out")}>
          {outDone ? `Salida ${outDone}` : busy === "out" ? "Localizando…" : "📍 Fichar salida"}
        </button>
      </div>
      {ask && (
        <form onSubmit={sendWithReason} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <label htmlFor="clock-reason" className="block text-sm font-medium text-amber-900">{ask.question}</label>
          <textarea
            id="clock-reason"
            className="input min-h-20 text-base"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Escribe el motivo (obligatorio)"
            maxLength={300}
            required
            autoFocus
          />
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={reason.trim().length < 3 || busy !== null}>
              {busy ? "Fichando…" : `Fichar ${ask.kind === "in" ? "entrada" : "salida"} con este motivo`}
            </button>
            <button type="button" className="btn" onClick={() => setAsk(null)} disabled={busy !== null}>Cancelar</button>
          </div>
        </form>
      )}
      {result && (
        <p role="status" className={`rounded-lg p-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {result.message}
        </p>
      )}
      <p className="text-xs text-stone-500">{windowText} Si no hay cobertura, ficha igualmente: se guarda en el móvil y se envía después.</p>
    </div>
  );
}
