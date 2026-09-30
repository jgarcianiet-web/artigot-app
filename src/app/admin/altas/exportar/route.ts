import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { today } from "@/lib/domain";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const t = today();
  const view = sp.get("ver") ?? "todos";
  const month = /^\d{4}-\d{2}$/.test(sp.get("mes") ?? "") ? sp.get("mes")! : t.slice(0, 7);
  const where =
    view === "activos" ? { startDate: { lte: t }, OR: [{ endDate: null }, { endDate: { gte: t } }] }
    : view === "mes" ? { OR: [{ startDate: { gte: `${month}-01`, lte: `${month}-31` } }, { endDate: { gte: `${month}-01`, lte: `${month}-31` } }] }
    : view === "sin-comunicar" ? { OR: [{ startReported: false }, { endDate: { not: null }, endReported: false }] }
    : {};
  const rows = await db.employment.findMany({ where, include: { worker: true }, orderBy: [{ startDate: "asc" }, { worker: { name: "asc" } }] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Altas y bajas");
  ws.columns = [
    { header: "Nombre", key: "name", width: 30 },
    { header: "DNI/NIE", key: "dni", width: 12 },
    { header: "NSS", key: "nss", width: 15 },
    { header: "Teléfono", key: "phone", width: 13 },
    { header: "Tipo de contrato", key: "contract", width: 34 },
    { header: "Categoría", key: "category", width: 16 },
    { header: "Horas/semana", key: "hours", width: 12 },
    { header: "Fecha alta", key: "start", width: 12 },
    { header: "Alta comunicada", key: "sr", width: 15 },
    { header: "Fecha baja", key: "end", width: 12 },
    { header: "Motivo baja", key: "reason", width: 28 },
    { header: "Baja comunicada", key: "er", width: 15 },
    { header: "Observaciones", key: "notes", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  const d = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
  for (const e of rows) {
    ws.addRow({
      name: e.worker.name, dni: e.worker.dni, nss: e.worker.nss, phone: e.worker.phone, contract: e.contractType, category: e.category,
      hours: e.hoursPerWeek, start: d(e.startDate), sr: e.startReported ? "Sí" : "No", end: d(e.endDate), reason: e.endReason,
      er: e.endDate ? (e.endReported ? "Sí" : "No") : "", notes: e.notes,
    });
  }
  for (const k of ["start", "end"]) ws.getColumn(k).numFmt = "dd/mm/yyyy";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "M1" };
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="altas_bajas_${t}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
