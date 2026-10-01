import { currentAdmin } from "@/lib/auth";
import { sseFromChannel } from "@/lib/sse";
import { isMember, staffChannel } from "@/lib/staffChat";

export const dynamic = "force-dynamic";

/** Tiempo real de una conversación: mensajes nuevos y «leído». */
export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const me = await currentAdmin();
  if (!me || !(await isMember(roomId, me.id))) return new Response("No autorizado", { status: 403 });
  return sseFromChannel(req, staffChannel(roomId), "staff");
}
