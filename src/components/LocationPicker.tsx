"use client";

import "leaflet/dist/leaflet.css";
import type { Circle, CircleMarker, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number };

/** Extrae coordenadas de «39.47, -0.37» o de enlaces de Google Maps / Apple Maps / OpenStreetMap. */
export function parseCoordinates(text: string): Point | null {
  const t = decodeURIComponent(text.trim());
  const patterns = [
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // google.com/maps/@lat,lng,17z
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // google place data
    /[?&](?:q|query|ll|sll|daddr|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, // ?q=lat,lng
    /[?&]mlat=(-?\d{1,2}\.\d+)&mlon=(-?\d{1,3}\.\d+)/, // openstreetmap
    /^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/, // lat, lng
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const p = { lat: Number(m[1]), lng: Number(m[2]) };
      if (Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180) return p;
    }
  }
  return null;
}

const SPAIN: Point = { lat: 39.47, lng: -0.376 }; // vista inicial (Valencia) si el evento no tiene punto
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function LocationPicker({
  initial,
  radius,
  venueInputName = "venue",
}: {
  initial: Point | null;
  radius: number;
  venueInputName?: string;
}) {
  const [point, setPoint] = useState<Point | null>(initial);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<{ marker: CircleMarker; circle: Circle } | null>(null);
  const setRef = useRef(setPoint);

  // Mapa (Leaflet + OpenStreetMap). Clic en el mapa = colocar el punto del evento.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapEl.current || map.current) return;
      const start = initial ?? SPAIN;
      const m = L.map(mapEl.current, { scrollWheelZoom: false }).setView([start.lat, start.lng], initial ? 16 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);
      m.on("click", (e) => setRef.current({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }));
      map.current = m;
      if (initial) drawPoint(L, m, initial);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layers.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function drawPoint(L: typeof import("leaflet"), m: LeafletMap, p: Point) {
    if (layers.current) {
      layers.current.marker.setLatLng([p.lat, p.lng]);
      layers.current.circle.setLatLng([p.lat, p.lng]);
    } else {
      const circle = L.circle([p.lat, p.lng], { radius, color: "#5b3fd6", weight: 2, fillOpacity: 0.12 }).addTo(m);
      const marker = L.circleMarker([p.lat, p.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#5b3fd6", fillOpacity: 1 }).addTo(m);
      layers.current = { marker, circle };
    }
  }

  useEffect(() => {
    if (!point || !map.current) return;
    import("leaflet").then((L) => {
      if (!map.current) return;
      drawPoint(L, map.current, point);
      map.current.setView([point.lat, point.lng], Math.max(map.current.getZoom(), 16));
    });
  }, [point]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search() {
    const text = query.trim() || (document.querySelector<HTMLInputElement>(`input[name="${venueInputName}"]`)?.value ?? "");
    if (!text) return setMsg("Escribe una dirección o pega un enlace de Google Maps.");
    const direct = parseCoordinates(text);
    if (direct) {
      setPoint({ lat: round(direct.lat), lng: round(direct.lng) });
      return setMsg("Punto colocado. Ajústalo haciendo clic en el mapa si hace falta.");
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
      const list: { lat: number; lng: number; label: string }[] = res.ok ? await res.json() : [];
      if (!list.length) setMsg("No se ha encontrado esa dirección. Prueba con el nombre de la finca y el municipio, o haz clic en el mapa.");
      else {
        setPoint({ lat: round(list[0].lat), lng: round(list[0].lng) });
        setMsg(`Encontrado: ${list[0].label}. Comprueba que el punto es la entrada del recinto.`);
      }
    } catch {
      setMsg("No se ha podido buscar. Haz clic en el mapa para colocar el punto.");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setMsg("Este navegador no permite obtener la ubicación.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPoint({ lat: round(p.coords.latitude), lng: round(p.coords.longitude) });
        setMsg(`Ubicación actual (±${Math.round(p.coords.accuracy)} m).`);
        setBusy(false);
      },
      () => {
        setMsg("No se ha podido obtener tu ubicación.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="lat" value={point?.lat ?? ""} />
      <input type="hidden" name="lng" value={point?.lng ?? ""} />
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Dirección, enlace de Google Maps o «39.47, -0.37» (vacío = usar el lugar)"
          className="input min-w-0 flex-1"
          aria-label="Buscar ubicación"
        />
        <button type="button" className="btn" onClick={search} disabled={busy}>Buscar</button>
        <button type="button" className="btn" onClick={useMyLocation} disabled={busy}>📍 Estoy aquí</button>
      </div>
      <div ref={mapEl} className="z-0 h-72 w-full rounded-lg border border-stone-300 bg-stone-100" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
        <span>
          {point ? (
            <>
              Punto: {point.lat}, {point.lng} · el personal podrá fichar dentro del círculo de {radius} m.{" "}
              <button type="button" className="text-red-600 hover:underline" onClick={() => {
                setPoint(null);
                layers.current?.marker.remove();
                layers.current?.circle.remove();
                layers.current = null;
              }}>
                Quitar
              </button>
            </>
          ) : (
            <span className="font-medium text-amber-700">Sin ubicación: el personal no podrá fichar hasta que la fijes. Haz clic en el mapa.</span>
          )}
        </span>
      </div>
      {msg && <p className="text-sm text-stone-600">{msg}</p>}
    </div>
  );
}
