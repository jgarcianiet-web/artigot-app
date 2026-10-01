import { currentAdmin } from "@/lib/auth";
import { sseFromChannel } from "@/lib/sse";
import { staffInbox } from "@/lib/staffChat";

export const dynamic = "force-dynamic";

/** Avisa a la lista de conversaciones de que ha llegado un mensaje (para refrescarla). */
export async function GET(req: Request) {
  const me = await currentAdmin();
  if (!me) return new Response("No autorizado", { status: 403 });
  return sseFromChannel(req, staffInbox(me.id), "inbox");
}
