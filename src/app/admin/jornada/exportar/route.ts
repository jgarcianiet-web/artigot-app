import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getCompany } from "@/lib/contracts";
import { monthLabel, monthRecordDocs, monthRecords } from "@/lib/timeRecord";

/** Registro de jornada del mes de todo el personal (lo que pediría la Inspección de Trabajo). */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const month = req.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new NextResponse("Mes no válido", { status: 400 });
  const [records, docs, company] = await Promise.all([monthRecords(month), monthRecordDocs(month), getCompany()]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Registro de jornada");
  ws.addRow([`Registro de jornada · ${monthLabel(month)} · ${company.name || ""} ${company.cif ? `(CIF ${company.cif})` : ""}`]).font = { bold: true };
  ws.addRow([]);
  const header = ws.addRow(["Trabajador", "DNI/NIE", "NSS", "Fecha", "Evento", "Lugar", "Puesto", "Entrada", "Salida", "Horas", "Origen", "Firmado"]);
  header.font = { bold: true };
  for (const { worker, data } of records) {
    const doc = docs.find((d) => d.workerId === worker.id);
    for (const r of data.rows) {
      ws.addRow([worker.name, worker.dni, worker.nss, new Date(`${r.date}T00:00:00Z`), r.event, r.venue, r.role, r.checkIn, r.checkOut, r.hours, r.origin, doc?.signedAt ? "Sí" : "No"]);
    }
    const t = ws.addRow([`Total ${worker.name}`, "", "", "", "", "", "", "", "", data.totalHours]);
    t.font = { bold: true };
  }
  ws.getColumn(4).numFmt = "dd/mm/yyyy";
  [26, 12, 15, 12, 28, 24, 14, 9, 9, 8, 24, 9].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="registro_jornada_${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
