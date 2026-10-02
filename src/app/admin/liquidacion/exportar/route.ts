import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { ROLE_LABEL, type Role } from "@/lib/domain";
import { payrollLines, summarize } from "@/lib/payroll";

// CSV con ';' y coma decimal para que Excel en español lo abra directamente
const cell = (v: string | number | null | undefined) => {
  if (v == null) return "";
  if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const toCsv = (rows: (string | number | null | undefined)[][]) => "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("desde") ?? "";
  const to = sp.get("hasta") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new NextResponse("Fechas no válidas", { status: 400 });
  }
  const lines = await payrollLines(from, to, { extras: true });
  const detail = sp.get("detalle") === "1";
  const role = (r: string) => ROLE_LABEL[r as Role] ?? r;

  const csv = detail
    ? toCsv([
        ["Fecha", "Evento", "Lugar", "Trabajador", "Teléfono", "Puesto", "Entrada", "Salida", "Horas fichadas", "Horas liquidadas", "Tarifa €/h", "Importe €"],
        ...lines.map((l) => [
          l.a.event.date, l.a.event.name, l.a.event.venue, l.a.worker.name, l.a.worker.phone, role(l.a.role),
          l.a.checkIn, l.a.checkOut, l.hours, l.billedHours, l.hourlyRate, l.amount,
        ]),
      ])
    : toCsv([
        ["Trabajador", "Teléfono", "Email", "Puesto", "Servicios", "Servicios sin horas", "Horas", "Importe €"],
        ...summarize(lines).map((r) => [
          r.worker.name, r.worker.phone, r.worker.email, role(r.worker.role), r.services, r.missing, r.hours, r.amount,
        ]),
      ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="liquidacion_${detail ? "detalle_" : ""}${from}_${to}.csv"`,
    },
  });
}
