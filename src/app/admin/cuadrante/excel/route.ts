import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { today } from "@/lib/domain";
import { scheduleWorkbook, weekSchedule, weekStart } from "@/lib/schedule";

/** El cuadrante de la semana en Excel, con la misma forma que el que usaba RRHH. */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const d = req.nextUrl.searchParams.get("semana");
  const monday = weekStart(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today());
  const buffer = await scheduleWorkbook(await weekSchedule(monday));
  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cuadrante_${monday}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
