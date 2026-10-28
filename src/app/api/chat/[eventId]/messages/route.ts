import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/auth";
import { type Attachment, chatAccess, postMessage, recentMessages } from "@/lib/chat";
import { storeImage } from "@/lib/files";

export const dynamic = "force-dynamic";

/** ?grupo=… = el chat de ese grupo (eventos con «chat por grupos»); sin él, el chat general. */
const groupOf = (req: Request) => new URL(req.url).searchParams.get("grupo") || null;

async function authorize(eventId: string, groupId: string | null) {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return { viewer, ...(await chatAccess(viewer, eventId, groupId)) };
}

/** Mensajes recientes (se usa al reconectar para recuperar lo que se haya perdido). */
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const groupId = groupOf(req);
  if (!(await authorize(eventId, groupId))?.read) return new NextResponse("No autorizado", { status: 403 });
  return NextResponse.json(await recentMessages(eventId, 200, groupId));
}

/** Mensaje de texto (JSON) o con adjunto (multipart: foto y/o ubicación). */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const groupId = groupOf(req);
  const access = await authorize(eventId, groupId);
  if (!access?.read) return new NextResponse("No autorizado", { status: 403 });
  if (!access.write) return new NextResponse("En este evento el chat general es solo de avisos: escribe en el chat de tu grupo.", { status: 403 });
  const { viewer } = access;

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
  const message = await postMessage(viewer, eventId, body, attachment, groupId);
  if (!message) return new NextResponse("Mensaje vacío", { status: 400 });
  return NextResponse.json(message);
}
