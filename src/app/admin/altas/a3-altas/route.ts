import { NextResponse, type NextRequest } from "next/server";
import { getA3 } from "@/lib/a3";
import { buildAltasSucesivasWorkbook, getA3Alta } from "@/lib/a3alta";
import { isAdmin } from "@/lib/auth";
import { syncAutoEmployments } from "@/lib/autoAltas";
import { db } from "@/lib/db";
import { isRole, ROLE_LABEL, today, type Role } from "@/lib/domain";

/**
 * Excel de altas del día con el formato «MA - Alta sucesiva» de A3, para importarlo en A3 y que
 * genere el fichero para el Sistema RED (SILTRA). Solo lleva a quien ya tiene código de A3; quien
 * todavía no está en A3 se da de alta con el alta masiva.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const d = req.nextUrl.searchParams.get("dia");
  const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today();
  await syncAutoEmployments();
  const [a3, cfg, altas] = await Promise.all([
    getA3(),
    getA3Alta(),
    db.employment.findMany({
      where: { startDate: day, worker: { a3Code: { not: null } } },
      include: { worker: { select: { name: true, a3Code: true, firstName: true, surname1: true, surname2: true, role: true } } },
      orderBy: { worker: { name: "asc" } },
    }),
  ]);
  // El puesto del periodo (la categoría guarda su nombre); si no, el principal de la persona
  const roleOf = (category: string | null, fallback: string): Role =>
    (Object.entries(ROLE_LABEL).find(([, label]) => label === category)?.[0] as Role | undefined) ?? (isRole(fallback) ? fallback : "CAMARERO");
  const buffer = await buildAltasSucesivasWorkbook(
    altas
      .filter((e) => e.worker.a3Code?.trim())
      .map((e) => ({
        code: e.worker.a3Code, name: e.worker.name, firstName: e.worker.firstName, surname1: e.worker.surname1, surname2: e.worker.surname2, date: day,
        role: roleOf(e.category, e.worker.role),
      })),
    a3.companyCode,
    cfg,
  );
  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="altas_a3_${day}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
