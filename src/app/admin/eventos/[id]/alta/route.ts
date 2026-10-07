import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { callTime, ROLE_LABEL, type Role } from "@/lib/domain";

/** Datos del personal confirmado de un evento para tramitar el alta en la Seguridad Social (gestoría / A3). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const event = await db.event.findUnique({
    where: { id: (await params).id },
    include: { assignments: { where: { status: "CONFIRMADO" }, include: { worker: true, group: true }, orderBy: { worker: { name: "asc" } } } },
  });
  if (!event) return new NextResponse("No encontrado", { status: 404 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Altas");
  ws.columns = [
    { header: "Código A3", key: "a3", width: 11 },
    { header: "Apellidos y nombre", key: "name", width: 30 },
    { header: "DNI / NIE", key: "dni", width: 13 },
    { header: "Nº Seguridad Social", key: "nss", width: 18 },
    { header: "Fecha nacimiento", key: "birth", width: 16 },
    { header: "Dirección", key: "address", width: 32 },
    { header: "Teléfono", key: "phone", width: 14 },
    { header: "Email", key: "email", width: 26 },
    { header: "Puesto", key: "role", width: 20 },
    { header: "Fecha", key: "date", width: 12 },
    { header: "Hora inicio", key: "start", width: 11 },
    { header: "Hora fin", key: "end", width: 10 },
    { header: "Centro / lugar", key: "venue", width: 28 },
    { header: "Faltan datos", key: "missing", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const a of event.assignments) {
    const w = a.worker;
    const missing = [!w.dni && "DNI", !w.nss && "NSS", !w.birthDate && "nacimiento"].filter(Boolean).join(", ");
    const row = ws.addRow({
      a3: w.a3Code,
      name: w.name,
      dni: w.dni,
      nss: w.nss,
      birth: w.birthDate,
      address: w.address,
      phone: w.phone,
      email: w.email,
      role: ROLE_LABEL[a.role as Role] ?? a.role,
      date: event.date,
      start: callTime(event, a.role, a.group),
      end: event.endTime,
      venue: event.venue,
      missing,
    });
    if (missing) row.getCell("missing").font = { color: { argb: "FFB91C1C" }, bold: true };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="altas_${event.date}_${event.id}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
