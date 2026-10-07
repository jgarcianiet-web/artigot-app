import { NextResponse, type NextRequest } from "next/server";
import { monthBounds, monthLlamamientos, nominaWorkbooks } from "@/lib/a3nominas";
import { auditAdmin } from "@/lib/audit";
import { adminName } from "@/lib/auth";

/** Los 4 Excel de nóminas del mes para importar en A3 (en JSON para descargarlos todos de una vez). */
export async function POST(req: NextRequest) {
  const by = await adminName();
  if (!by) return new NextResponse("No autorizado", { status: 401 });
  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return new NextResponse("Mes no válido", { status: 400 });
  const { from, to } = monthBounds(mes);
  const { llamamientos } = await monthLlamamientos(from, to);
  const files = await nominaWorkbooks(llamamientos);
  await auditAdmin(by, "A3", "Nóminas", `Excel de nóminas para A3 de ${mes}: ${llamamientos.length} llamamientos`);
  return NextResponse.json(
    { files: files.map((f) => ({ name: `${mes}_${f.name}`, label: f.label, base64: f.data.toString("base64") })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
