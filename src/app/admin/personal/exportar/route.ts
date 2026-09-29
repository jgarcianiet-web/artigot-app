import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl, ROLE_LABEL, type Role } from "@/lib/domain";

/** Excel con el personal y sus códigos de acceso a la app, para repartirlos. */
export async function GET() {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const workers = await db.worker.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Accesos");
  ws.columns = [
    { header: "Nombre", key: "name", width: 28 },
    { header: "Teléfono", key: "phone", width: 16 },
    { header: "Puesto", key: "role", width: 12 },
    { header: "Código de acceso", key: "code", width: 18 },
    { header: "Estado", key: "active", width: 10 },
    { header: "Zona", key: "zone", width: 18 },
    { header: "Email", key: "email", width: 26 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const w of workers) {
    ws.addRow({
      name: w.name,
      phone: w.phone,
      role: ROLE_LABEL[w.role as Role] ?? w.role,
      code: w.accessCode,
      active: w.active ? "Activo" : "Baja",
      zone: w.zone,
      email: w.email,
    });
  }
  ws.getColumn("code").numFmt = "@";
  ws.getColumn("code").font = { name: "Consolas", bold: true };
  ws.addRow([]);
  ws.addRow([`Acceso: ${appUrl()}/entrar con el teléfono y el código. Documento confidencial.`]);
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="accesos_personal_${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
