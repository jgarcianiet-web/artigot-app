import { NextResponse, type NextRequest } from "next/server";
import { getA3 } from "@/lib/a3";
import { buildBajasWorkbook, getA3Alta } from "@/lib/a3alta";
import { isAdmin } from "@/lib/auth";
import { syncAutoEmployments } from "@/lib/autoAltas";
import { db } from "@/lib/db";
import { today } from "@/lib/domain";

/**
 * Excel de bajas del día con el formato «MB - Baja» de A3, para importarlo en A3 y que genere el
 * fichero para el Sistema RED (SILTRA). Una fila por cada baja con fecha de ese día.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const d = req.nextUrl.searchParams.get("dia");
  const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today();
  await syncAutoEmployments();
  const [a3, cfg, bajas] = await Promise.all([
    getA3(),
    getA3Alta(),
    db.employment.findMany({
      where: { endDate: day },
      include: { worker: { select: { name: true, a3Code: true, firstName: true, surname1: true, surname2: true } } },
      orderBy: { worker: { name: "asc" } },
    }),
  ]);
  const buffer = await buildBajasWorkbook(
    bajas.map((e) => ({ code: e.worker.a3Code, name: e.worker.name, firstName: e.worker.firstName, surname1: e.worker.surname1, surname2: e.worker.surname2, date: day })),
    a3.companyCode,
    cfg,
  );
  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bajas_a3_${day}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
