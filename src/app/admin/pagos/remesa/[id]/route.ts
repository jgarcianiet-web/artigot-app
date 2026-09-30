import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Descarga del fichero de la remesa SEPA para subirlo a la banca online. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const r = await db.remittance.findUnique({ where: { id: (await params).id } });
  if (!r) return new NextResponse("No encontrada", { status: 404 });
  return new NextResponse(r.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="remesa_${r.msgId}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
