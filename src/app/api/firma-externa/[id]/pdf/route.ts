import { currentViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { externalPdf } from "@/lib/externalSign";

/** PDF firmado de una persona de fuera de la plataforma: solo RRHH. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentViewer();
  if (viewer?.kind !== "admin") return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const s = await db.externalSigner.findUnique({ where: { id }, select: { signedAt: true } });
  if (!s) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(await externalPdf(id)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="documento_${id}${s.signedAt ? "_firmado" : ""}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
