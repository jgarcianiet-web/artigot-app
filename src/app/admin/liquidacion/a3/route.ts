import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { A3_HEADERS, a3Lines } from "@/lib/a3";
import { isAdmin } from "@/lib/auth";

const cell = (v: string | number) => {
  if (typeof v === "number") return String(v).replace(".", ",");
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("desde") ?? "";
  const to = sp.get("hasta") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new NextResponse("Fechas no válidas", { status: 400 });
  const { rows } = await a3Lines(from, to);
  const data = rows.map((r) => [r.companyCode, r.workerCode, r.nif, r.name, r.concept, r.conceptName, r.units, r.price, r.amount, r.period]);
  const name = `a3_nomina_${from}_${to}`;

  if (sp.get("formato") === "csv") {
    const csv = "﻿" + [A3_HEADERS, ...data].map((r) => r.map(cell).join(";")).join("\r\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" },
    });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Variables");
  ws.addRow(A3_HEADERS).font = { bold: true };
  for (const r of data) ws.addRow(r);
  ws.columns.forEach((c, i) => (c.width = [14, 16, 12, 30, 15, 30, 10, 10, 11, 12][i]));
  for (const col of [7, 8, 9]) ws.getColumn(col).numFmt = "0.00";
  // Los códigos se guardan como texto para no perder ceros a la izquierda
  for (const col of [1, 2, 5]) ws.getColumn(col).eachCell((c, row) => { if (row > 1 && c.value != null) c.value = String(c.value); });
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
