import { sseFromChannel } from "@/lib/sse";
import { dmChannel } from "@/lib/workerChat";
import { dmAccess } from "../access";

export const dynamic = "force-dynamic";

/** Tiempo real de la conversación: mensajes nuevos y «leído». */
export async function GET(req: Request, { params }: { params: Promise<{ workerId: string }> }) {
  const { workerId } = await params;
  if (!(await dmAccess(workerId))) return new Response("No autorizado", { status: 403 });
  return sseFromChannel(req, dmChannel(workerId), "staff");
}
