import { bus } from "./bus";

/** Respuesta Server-Sent Events que reenvía lo que se publique en un canal del bus. */
export function sseFromChannel(req: Request, channel: string, event: string) {
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
      const onData = (data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const ping = setInterval(() => write(`: ping\n\n`), 25_000);
      bus.on(channel, onData);
      cleanup = () => {
        clearInterval(ping);
        bus.off(channel, onData);
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
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
