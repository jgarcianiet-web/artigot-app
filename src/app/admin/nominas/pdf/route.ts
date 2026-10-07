import { NextResponse, type NextRequest } from "next/server";
import { auditAdmin } from "@/lib/audit";
import { adminName } from "@/lib/auth";
import { monthName, splitPayslips } from "@/lib/payslips";

/** Sube el PDF con todas las nóminas del mes que ha calculado A3: se separa por DNI y cada uno recibe la suya. */
export async function POST(req: NextRequest) {
  const by = await adminName();
  if (!by) return new NextResponse("No autorizado", { status: 401 });
  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: "Mes no válido." }, { status: 400 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Elige el PDF de las nóminas." }, { status: 400 });
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "El archivo no es un PDF." }, { status: 400 });
  try {
    const r = await splitPayslips(data, mes, by);
    await auditAdmin(by, "A3", "Nóminas", `PDF de nóminas de ${monthName(mes)}: ${r.pages} páginas, ${r.workers} trabajadores${r.unknown.length ? `, ${r.unknown.length} páginas sin identificar` : ""}`);
    return NextResponse.json(r);
  } catch (e) {
    console.error("nóminas pdf", e);
    return NextResponse.json({ error: "No se ha podido leer el PDF. ¿Es el de las nóminas que genera A3 (con texto, no escaneado)?" }, { status: 400 });
  }
}
