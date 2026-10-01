import { currentViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { canReadFile, readStoredFile } from "@/lib/files";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await currentViewer();
  if (!viewer) return new Response("No autorizado", { status: 401 });
  const meta = await db.storedFile.findUnique({ where: { id }, select: { scope: true, eventId: true, workerId: true } });
  if (!meta || !(await canReadFile(viewer, meta))) return new Response("No encontrado", { status: 404 });
  const file = await db.storedFile.findUniqueOrThrow({ where: { id }, select: { data: true, storageKey: true, mime: true, scope: true } });
  let body: Buffer;
  try {
    body = await readStoredFile(file);
  } catch (e) {
    console.error("archivo", id, e);
    return new Response("No se ha podido leer el archivo", { status: 502 });
  }
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": ["DOC", "SIGNATURE", "CANDIDATE", "PHOTO", "STAFF"].includes(file.scope) ? "private, no-store" : "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // El visor de PDF del navegador no funciona con una CSP restrictiva; a las imágenes sí se les aplica
      ...(file.mime === "application/pdf" ? { "Content-Disposition": "inline" } : { "Content-Security-Policy": "default-src 'none'" }),
    },
  });
}
