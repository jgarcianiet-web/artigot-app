import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { budgetPdf, budgetRows } from "@/lib/budget";
import { formatDate } from "@/lib/domain";
import { budgetFilters } from "../filters";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const eventId = sp.get("evento");
  let rows, title, subtitle, file;
  if (eventId) {
    rows = await budgetRows({ eventId });
    if (!rows.length) return new NextResponse("No encontrado", { status: 404 });
    title = `Presupuesto y gasto · ${rows[0].name}`;
    subtitle = `${formatDate(rows[0].date, { long: true })}${rows[0].salesRep ? ` · Comercial: ${rows[0].salesRep}` : ""}`;
    file = `presupuesto_${rows[0].date}.pdf`;
  } else {
    const f = budgetFilters({ desde: sp.get("desde"), hasta: sp.get("hasta"), comercial: sp.get("comercial") });
    rows = await budgetRows({ from: f.from, to: f.to, salesRep: f.salesRep });
    title = "Presupuesto y gasto de personal";
    subtitle = `Del ${formatDate(f.from, { long: true })} al ${formatDate(f.to, { long: true })}${f.salesRep ? ` · Comercial: ${f.salesRep === "-" ? "sin comercial" : f.salesRep}` : ""}`;
    file = `presupuestos_${f.from}_${f.to}.pdf`;
  }
  const pdf = await budgetPdf(rows, title, subtitle);
  return new NextResponse(pdf as unknown as ArrayBuffer, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file}"`, "Cache-Control": "no-store" },
  });
}
