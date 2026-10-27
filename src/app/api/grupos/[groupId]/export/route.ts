import { NextResponse } from "next/server";
import { auditAdmin } from "@/lib/audit";
import { currentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { groupChatPdf } from "@/lib/workerChatExport";

/** PDF de un grupo con el personal (solo RRHH). */
export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return new NextResponse("No autorizado", { status: 403 });
  const { groupId } = await params;
  if (!(await db.workerGroup.findUnique({ where: { id: groupId }, select: { id: true } }))) return new NextResponse("No encontrado", { status: 404 });
  const { bytes, name } = await groupChatPdf(groupId, admin.name);
  await auditAdmin(admin.name, "Mensajes", "Grupo exportado", `Grupo «${name}» exportado en PDF`, { entityId: groupId });
  const file = `grupo_${name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" },
  });
}
