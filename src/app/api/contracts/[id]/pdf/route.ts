import { currentViewer } from "@/lib/auth";
import { contractPdf } from "@/lib/contracts";
import { db } from "@/lib/db";

/** PDF del documento de condiciones: RRHH o el propio trabajador. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await currentViewer();
  if (!viewer) return new Response("No autorizado", { status: 401 });
  const c = await db.contract.findUnique({ where: { id }, select: { workerId: true, eventId: true, signedAt: true } });
  if (!c || (viewer.kind === "worker" && viewer.id !== c.workerId)) return new Response("No encontrado", { status: 404 });
  const bytes = await contractPdf(id);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="condiciones_${id}${c.signedAt ? "_firmado" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
