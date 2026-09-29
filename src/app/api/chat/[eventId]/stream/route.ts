import { currentViewer } from "@/lib/auth";
import { bus, chatChannel } from "@/lib/bus";
import { canAccessChat, type ChatMessage } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** Server-Sent Events: envía cada mensaje nuevo del chat en cuanto se publica. */
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const viewer = await currentViewer();
  if (!viewer || !(await canAccessChat(viewer, eventId))) return new Response("No autorizado", { status: 403 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const onMessage = (m: ChatMessage) => write(`event: message\ndata: ${JSON.stringify(m)}\n\n`);
      const ping = setInterval(() => write(`: ping\n\n`), 25_000);
      bus.on(chatChannel(eventId), onMessage);
      cleanup = () => {
        clearInterval(ping);
        bus.off(chatChannel(eventId), onMessage);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      write(`retry: 3000\n\n`);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
