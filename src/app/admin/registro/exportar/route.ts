import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { auditWhere } from "@/lib/auditQuery";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const rows = await db.auditLog.findMany({ where: auditWhere(Object.fromEntries(req.nextUrl.searchParams)), orderBy: { at: "desc" }, take: 50_000 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Registro de cambios");
  ws.columns = [
    { header: "Fecha y hora", key: "at", width: 19 },
    { header: "Quién", key: "actor", width: 24 },
    { header: "Tipo", key: "kind", width: 11 },
    { header: "Área", key: "entity", width: 18 },
    { header: "Acción", key: "action", width: 20 },
    { header: "Detalle", key: "summary", width: 90 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow({ at: r.at, actor: r.actor, kind: r.actorKind, entity: r.entity, action: r.action, summary: r.summary });
  ws.getColumn("at").numFmt = "dd/mm/yyyy hh:mm";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="registro_cambios.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
