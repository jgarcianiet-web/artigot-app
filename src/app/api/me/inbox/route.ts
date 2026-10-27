import { workerInbox } from "@/lib/bus";
import { currentWorker } from "@/lib/auth";
import { sseFromChannel } from "@/lib/sse";

export const dynamic = "force-dynamic";

/** Avisa a la app del trabajador cuando cambian sus chats sin leer (llega un mensaje o lo lee). */
export async function GET(req: Request) {
  const me = await currentWorker();
  if (!me) return new Response("No autorizado", { status: 403 });
  return sseFromChannel(req, workerInbox(me.id), "inbox");
}
