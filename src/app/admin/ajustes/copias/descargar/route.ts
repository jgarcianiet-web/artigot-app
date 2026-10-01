import { NextResponse, type NextRequest } from "next/server";
import { auditAdmin } from "@/lib/audit";
import { adminName } from "@/lib/auth";
import { BACKUP_PREFIX, exportDatabase, packBackup } from "@/lib/backup";
import { getRawObject } from "@/lib/storage";

/**
 * Descarga de copias: «?ahora=1» genera una al momento (sin cifrar, para guardarla fuera);
 * «?key=backups/…» descarga una del almacén tal como está guardada (cifrada si hay clave).
 */
export async function GET(req: NextRequest) {
  const by = await adminName();
  if (!by) return new NextResponse("No autorizado", { status: 401 });
  const key = req.nextUrl.searchParams.get("key");
  let body: Buffer;
  let name: string;
  if (key) {
    if (!key.startsWith(BACKUP_PREFIX) || key.includes("..")) return new NextResponse("No válida", { status: 400 });
    body = await getRawObject(key);
    name = key.slice(BACKUP_PREFIX.length);
  } else {
    body = packBackup(await exportDatabase());
    name = `artigot-${new Date().toISOString().slice(0, 10)}.json.gz`;
  }
  await auditAdmin(by, "Copias", "Descarga", `Descargada la copia ${name}`);
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
