import { currentViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { canReadFile } from "@/lib/files";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await currentViewer();
  if (!viewer) return new Response("No autorizado", { status: 401 });
  const meta = await db.storedFile.findUnique({ where: { id }, select: { scope: true, eventId: true } });
  if (!meta || !(await canReadFile(viewer, meta))) return new Response("No encontrado", { status: 404 });
  const file = await db.storedFile.findUniqueOrThrow({ where: { id }, select: { data: true, mime: true } });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
