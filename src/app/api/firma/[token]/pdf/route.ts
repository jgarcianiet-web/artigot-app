import { cookies } from "next/headers";
import { externalPdf, hasSession, sessionCookie, signerByToken } from "@/lib/externalSign";

/** El documento para la persona de fuera, con su sesión del código (original o ya firmado). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const s = await signerByToken((await params).token);
  if (!s || !hasSession(s, (await cookies()).get(sessionCookie(s.id))?.value)) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(await externalPdf(s.id)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="documento${s.signedAt ? "_firmado" : ""}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
