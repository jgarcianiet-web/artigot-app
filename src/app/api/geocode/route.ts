import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { appUrl } from "@/lib/domain";

/** Búsqueda de direcciones (OpenStreetMap Nominatim) para situar los eventos. Solo RRHH. */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200);
  if (!q) return NextResponse.json([]);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q, format: "jsonv2", limit: "5", countrycodes: "es", "accept-language": "es" }).toString();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `ArtigotPersonal/1.0 (${appUrl()})` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json([], { status: 502 });
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    return NextResponse.json(rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name })));
  } catch {
    return NextResponse.json([], { status: 502 });
  }
}
