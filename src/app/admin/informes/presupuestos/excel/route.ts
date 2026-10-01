import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { budgetRows, bySalesRep } from "@/lib/budget";
import { budgetFilters } from "../filters";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const f = budgetFilters({ desde: sp.get("desde"), hasta: sp.get("hasta"), comercial: sp.get("comercial") });
  const rows = await budgetRows({ from: f.from, to: f.to, salesRep: f.salesRep });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Presupuestos");
  ws.columns = [
    { header: "DIA", key: "date", width: 11 },
    { header: "CLIENTE/EVENTO", key: "name", width: 36 },
    { header: "COMERCIAL", key: "rep", width: 16 },
    { header: "MAITRE", key: "lead", width: 22 },
    { header: "PRESUPUESTADO", key: "budget", width: 14 },
    { header: "GASTO", key: "cost", width: 12 },
    { header: "DESVIACION", key: "dev", width: 12 },
    { header: "% DESVIACIÓN", key: "pct", width: 13 },
    { header: "COMENTARIO", key: "note", width: 36 },
  ];
  for (const r of rows) {
    ws.addRow({
      date: new Date(`${r.date}T00:00:00Z`),
      name: [r.client, r.name].filter(Boolean).join(" / "),
      rep: r.salesRep,
      lead: r.lead,
      budget: r.budget,
      cost: r.done ? r.cost : null,
      dev: r.deviation,
      pct: r.pct == null ? null : r.pct / 100,
      note: [r.note, r.estimated && "presupuesto calculado", r.pending && `${r.pending} sin horas`].filter(Boolean).join(" · "),
    });
  }
  ws.getColumn("date").numFmt = "dd/mm/yyyy";
  for (const k of ["budget", "cost", "dev"]) ws.getColumn(k).numFmt = "#,##0.00 €";
  ws.getColumn("pct").numFmt = "0.0%";
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const g = wb.addWorksheet("Por comercial");
  g.columns = [
    { header: "COMERCIAL", key: "rep", width: 18 },
    { header: "EVENTOS", key: "events", width: 9 },
    { header: "CERRADOS", key: "done", width: 10 },
    { header: "PRESUPUESTADO", key: "budget", width: 14 },
    { header: "GASTO", key: "cost", width: 12 },
    { header: "DESVIACION", key: "deviation", width: 12 },
    { header: "% DESVIACIÓN", key: "pct", width: 13 },
  ];
  for (const x of bySalesRep(rows)) g.addRow({ ...x, rep: x.rep || "Sin comercial", pct: x.pct == null ? null : x.pct / 100 });
  for (const k of ["budget", "cost", "deviation"]) g.getColumn(k).numFmt = "#,##0.00 €";
  g.getColumn("pct").numFmt = "0.0%";
  g.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="presupuestos_${f.from}_${f.to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
