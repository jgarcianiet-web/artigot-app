import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { formatNaf, getA3Alta, splitName } from "@/lib/a3alta";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, today } from "@/lib/domain";
import { covers } from "@/lib/employment";
import { halfFromKey, halfOf, payPeriod, shiftHalf } from "@/lib/pay";
import { payrollLines } from "@/lib/payroll";
import { validIban } from "@/lib/staff";

/**
 * Excel de extras de la quincena con el mismo formato que el que llevaba RRHH a mano:
 * «Relación altas-bajas» (una fila por servicio, con alta y baja en la Seguridad Social; «SIGUE»
 * si trabaja también el día siguiente) y «tabla total» (importe e IBAN por trabajador).
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const h = halfFromKey(req.nextUrl.searchParams.get("q") ?? "") ?? shiftHalf(halfOf(today()), -1);
  const [cfg, lines, period] = await Promise.all([getA3Alta(), payrollLines(h.from, addDays(h.to, 1), { extras: true }), payPeriod(h)]);
  const employments = await db.employment.findMany({
    where: { workerId: { in: [...new Set(lines.map((l) => l.a.workerId))] } },
    select: { workerId: true, startDate: true, endDate: true, startReported: true, endReported: true },
  });
  const worksOn = new Set(lines.map((l) => `${l.a.workerId}|${l.a.event.date}`));
  const name = (w: Parameters<typeof splitName>[0]) => {
    const n = splitName(w);
    return `${[n.s1, n.s2].filter(Boolean).join(" ")}, ${n.first}`;
  };
  const d = (s: string) => new Date(`${s}T00:00:00Z`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Relación altas-bajas");
  ws.columns = [
    { header: "FECHA", key: "date", width: 11 },
    { header: "HORAS", key: "hours", width: 7 },
    { header: "IMPORTE", key: "amount", width: 10 },
    { header: "DNI", key: "dni", width: 12 },
    { header: "Nombre", key: "name", width: 34 },
    { header: "CODIGO", key: "code", width: 9 },
    { header: "NASS", key: "nass", width: 16 },
    { header: "CENTRO", key: "center", width: 8 },
    { header: "ALTA SEGURIDAD SOCIAL", key: "alta", width: 12 },
    { header: "A3 INNUVA", key: "a3", width: 24 },
    { header: "LLAMAMIENTO", key: "call", width: 13 },
    { header: "BAJA SEGURIDAD SOCIAL", key: "baja", width: 12 },
    { header: "EVENTO", key: "event", width: 30 },
  ];
  const rows = lines.filter((l) => l.a.event.date <= h.to).sort((a, b) => a.a.event.date.localeCompare(b.a.event.date) || a.a.worker.name.localeCompare(b.a.worker.name, "es"));
  for (const l of rows) {
    const w = l.a.worker;
    const date = l.a.event.date;
    const emp = employments.filter((e) => e.workerId === w.id && covers(e, date));
    const notes = [!w.a3Code && "FALTA CÓDIGO A3", !(w.iban && validIban(w.iban)) && "FALTA BANCO", l.hours == null && "FALTAN HORAS"].filter(Boolean).join(" · ");
    ws.addRow({
      date: d(date),
      hours: l.billedHours,
      amount: l.amount,
      dni: w.dni,
      name: name(w),
      code: w.a3Code,
      nass: formatNaf(w.nss),
      center: w.a3Center || cfg.center,
      alta: emp.some((e) => e.startReported) ? "X" : "",
      a3: notes,
      call: "",
      baja: worksOn.has(`${w.id}|${addDays(date, 1)}`) ? "SIGUE" : emp.some((e) => e.endDate === date && e.endReported) ? "X" : "",
      event: l.a.event.name,
    });
  }
  ws.getColumn("date").numFmt = "dd/mm/yyyy";
  ws.getColumn("amount").numFmt = "#,##0.00";
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "M1" };

  const total = wb.addWorksheet("tabla total");
  total.columns = [
    { header: "CODIGO", key: "code", width: 9 },
    { header: "DNI", key: "dni", width: 12 },
    { header: "NOMBRE", key: "name", width: 34 },
    { header: "HORAS", key: "hours", width: 8 },
    { header: "IMPORTE", key: "net", width: 11 },
    { header: "EUR", key: "eur", width: 5 },
    { header: "IBAN", key: "iban", width: 28 },
  ];
  const workers = new Map(rows.map((l) => [l.a.workerId, l.a.worker]));
  for (const r of period.rows) {
    const w = workers.get(r.workerId);
    total.addRow({ code: r.a3Code, dni: r.dni, name: w ? name(w) : r.name, hours: r.hours, net: r.net, eur: "EUR", iban: r.iban && validIban(r.iban) ? r.iban : "No encontrado" });
  }
  const sum = period.rows.reduce((s, r) => s + r.net, 0);
  const last = total.addRow({ name: "Total general", hours: period.rows.reduce((s, r) => s + r.hours, 0), net: Math.round(sum * 100) / 100 });
  last.font = { bold: true };
  total.getColumn("net").numFmt = "#,##0.00";
  total.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  const label = `${h.from.slice(5, 7)}_${h.from.slice(8)}-${h.to.slice(8)}_${h.from.slice(0, 4)}`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="EXTRAS_${label}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
