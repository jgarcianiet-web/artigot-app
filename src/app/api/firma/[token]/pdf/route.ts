import { cookies } from "next/headers";
import { externalPdf, hasSession, sessionCookie, signerByToken } from "@/lib/externalSign";

/** Un documento del envío para la persona de fuera, con su sesión (original o ya firmado). ?doc=0, 1, 2… */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const s = await signerByToken((await params).token);
  if (!s || !hasSession(s, (await cookies()).get(sessionCookie(s.id))?.value)) return new Response("No encontrado", { status: 404 });
  const doc = Math.max(0, Number(new URL(req.url).searchParams.get("doc")) || 0);
  const bytes = await externalPdf(s.id, doc);
  if (!bytes) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="documento${doc ? `_${doc + 1}` : ""}${s.signedAt ? "_firmado" : ""}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
