import { currentViewer } from "@/lib/auth";
import { contractPdf } from "@/lib/contracts";
import { db } from "@/lib/db";
import { isPrl, prlPdf } from "@/lib/prl";

/** PDF del documento de condiciones: RRHH o el propio trabajador. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await currentViewer();
  if (!viewer) return new Response("No autorizado", { status: 401 });
  const c = await db.contract.findUnique({ where: { id }, select: { workerId: true, eventId: true, signedAt: true, kind: true } });
  if (!c || (viewer.kind === "worker" && viewer.id !== c.workerId)) return new Response("No encontrado", { status: 404 });
  // Documentos de PRL: la plantilla de la empresa rellenada; el resto, el documento de la app
  const bytes = isPrl(c.kind) ? await prlPdf(id) : await contractPdf(id);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${isPrl(c.kind) ? c.kind.toLowerCase() : "condiciones"}_${id}${c.signedAt ? "_firmado" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
