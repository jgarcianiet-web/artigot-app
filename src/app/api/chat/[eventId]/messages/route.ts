import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/auth";
import { type Attachment, canAccessChat, postMessage, recentMessages } from "@/lib/chat";
import { storeImage } from "@/lib/files";

export const dynamic = "force-dynamic";

async function authorize(eventId: string) {
  const viewer = await currentViewer();
  return viewer && (await canAccessChat(viewer, eventId)) ? viewer : null;
}

/** Mensajes recientes (se usa al reconectar para recuperar lo que se haya perdido). */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!(await authorize(eventId))) return new NextResponse("No autorizado", { status: 403 });
  return NextResponse.json(await recentMessages(eventId));
}

/** Mensaje de texto (JSON) o con adjunto (multipart: foto y/o ubicación). */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const viewer = await authorize(eventId);
  if (!viewer) return new NextResponse("No autorizado", { status: 403 });

  let body = "";
  const attachment: Attachment = {};
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData();
    body = String(form.get("body") ?? "");
    const lat = Number(form.get("lat"));
    const lng = Number(form.get("lng"));
    if (form.get("lat") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      Object.assign(attachment, { lat, lng });
    }
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        attachment.fileId = (await storeImage(file, { eventId, scope: "CHAT" })).id;
      } catch (e) {
        return new NextResponse((e as Error).message, { status: 400 });
      }
    }
  } else {
    const json = (await req.json().catch(() => ({}))) as { body?: unknown };
    body = typeof json.body === "string" ? json.body : "";
  }
  const message = await postMessage(viewer, eventId, body, attachment);
  if (!message) return new NextResponse("Mensaje vacío", { status: 400 });
  return NextResponse.json(message);
}
