import { NextResponse } from "next/server";
import { auditAdmin } from "@/lib/audit";
import { currentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { workerChatPdf } from "@/lib/workerChatExport";

/** PDF de la conversación con un trabajador (solo RRHH). */
export async function GET(_req: Request, { params }: { params: Promise<{ workerId: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return new NextResponse("No autorizado", { status: 403 });
  const { workerId } = await params;
  if (!(await db.worker.findUnique({ where: { id: workerId }, select: { id: true } }))) return new NextResponse("No encontrado", { status: 404 });
  const { bytes, name } = await workerChatPdf(workerId, admin.name);
  await auditAdmin(admin.name, "Mensajes", "Conversación exportada", `Chat con ${name} exportado en PDF`, { entityId: workerId });
  const file = `chat_${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" },
  });
}
