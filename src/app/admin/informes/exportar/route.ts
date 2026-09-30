import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { buildReport } from "@/lib/reports";

/** Informe del periodo en Excel: una hoja por tabla. */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const from = req.nextUrl.searchParams.get("desde") ?? "";
  const to = req.nextUrl.searchParams.get("hasta") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new NextResponse("Fechas no válidas", { status: 400 });
  const r = await buildReport(from, to);
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, columns: { header: string; key: string; width: number; numFmt?: string }[], rows: object[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map(({ numFmt, ...c }) => ({ ...c, style: numFmt ? { numFmt } : {} }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    rows.forEach((row) => ws.addRow(row));
  };
  const EUR = '#,##0.00 "€"';
  sheet("Resumen", [{ header: "Indicador", key: "k", width: 30 }, { header: "Valor", key: "v", width: 16 }], [
    { k: "Periodo", v: `${from} a ${to}` },
    { k: "Eventos", v: r.kpis.events },
    { k: "Servicios", v: r.kpis.services },
    { k: "Horas", v: r.kpis.hours },
    { k: "Coste de personal (€)", v: Math.round(r.kpis.cost * 100) / 100 },
    { k: "% aceptación", v: r.kpis.acceptRate == null ? "" : Math.round(r.kpis.acceptRate * 100) },
    { k: "Tiempo medio de respuesta (h)", v: r.kpis.avgResponseH == null ? "" : Math.round(r.kpis.avgResponseH * 10) / 10 },
    { k: "Incidencias", v: r.kpis.incidents },
  ]);
  sheet(
    "Por evento",
    [
      { header: "Fecha", key: "date", width: 12 },
      { header: "Evento", key: "name", width: 32 },
      { header: "Cliente", key: "client", width: 24 },
      { header: "Personal", key: "staff", width: 10 },
      { header: "Horas", key: "hours", width: 10 },
      { header: "Coste", key: "cost", width: 14, numFmt: EUR },
      { header: "Incidencias", key: "inc", width: 12 },
    ],
    r.byEvent.map((e) => ({ date: e.date, name: e.name, client: e.client, staff: e.staff, hours: e.hours, cost: e.cost, inc: e._count.incidents })),
  );
  sheet(
    "Por trabajador",
    [
      { header: "Trabajador", key: "name", width: 28 },
      { header: "Servicios", key: "services", width: 10 },
      { header: "Horas", key: "hours", width: 10 },
      { header: "Importe", key: "cost", width: 14, numFmt: EUR },
      { header: "Valoración media", key: "avg", width: 16 },
      { header: "Rechazos", key: "rejected", width: 10 },
      { header: "Retiradas", key: "withdrawals", width: 10 },
      { header: "Retrasos", key: "lates", width: 10 },
      { header: "Ausencias", key: "noShows", width: 10 },
    ],
    r.workers.map((w) => ({ ...w, avg: w.avgReview == null ? "" : Math.round(w.avgReview * 10) / 10 })),
  );
  sheet("Coste por mes", [{ header: "Mes", key: "key", width: 10 }, { header: "Servicios", key: "services", width: 10 }, { header: "Coste", key: "cost", width: 14, numFmt: EUR }], r.trend);
  sheet("Incidencias", [{ header: "Tipo", key: "label", width: 32 }, { header: "Número", key: "count", width: 10 }], r.incidents);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="informe_${from}_${to}.xlsx"`,
    },
  });
}
