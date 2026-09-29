"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clock, type ClockResult } from "@/app/app/actions";

type Position = { lat: number; lng: number; accuracy: number };

const isNativeApp = () =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Posición actual con alta precisión: GPS nativo en la app, API del navegador en la web. */
async function currentPosition(): Promise<Position> {
  if (isNativeApp()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      const req = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (req.location !== "granted") throw new Error("denied");
    }
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
  }
  if (!("geolocation" in navigator)) throw new Error("unsupported");
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable")),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    ),
  );
}

const LOCATION_ERRORS: Record<string, string> = {
  denied: "Necesitamos tu ubicación para fichar. Permite el acceso a la ubicación en los ajustes del móvil y vuelve a intentarlo.",
  unsupported: "Este dispositivo no permite obtener la ubicación.",
  unavailable: "No se ha podido obtener tu ubicación. Activa el GPS e inténtalo de nuevo.",
};

export function ClockButtons({
  assignmentId,
  checkIn,
  checkOut,
  windowText,
}: {
  assignmentId: string;
  checkIn: string | null;
  checkOut: string | null;
  windowText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [result, setResult] = useState<ClockResult | null>(null);

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
      const r = await clock(assignmentId, kind, position);
      setResult(r);
      if (r.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "No se ha podido fichar. Revisa la conexión e inténtalo de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-success w-full py-4 text-base"
          disabled={!!checkIn || busy !== null}
          onClick={() => doClock("in")}
        >
          {checkIn ? `Entrada ${checkIn}` : busy === "in" ? "Localizando…" : "📍 Fichar entrada"}
        </button>
        <button
          type="button"
          className="btn btn-primary w-full py-4 text-base"
          disabled={!checkIn || !!checkOut || busy !== null}
          onClick={() => doClock("out")}
        >
          {checkOut ? `Salida ${checkOut}` : busy === "out" ? "Localizando…" : "📍 Fichar salida"}
        </button>
      </div>
      {result && (
        <p
          role="status"
          className={`rounded-lg p-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
        >
          {result.message}
        </p>
      )}
      <p className="text-xs text-stone-500">{windowText}</p>
    </div>
  );
}
