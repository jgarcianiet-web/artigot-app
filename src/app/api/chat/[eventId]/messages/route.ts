import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/auth";
import { canAccessChat, postMessage, recentMessages } from "@/lib/chat";

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

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const viewer = await authorize(eventId);
  if (!viewer) return new NextResponse("No autorizado", { status: 403 });
  const { body } = (await req.json().catch(() => ({}))) as { body?: unknown };
  if (typeof body !== "string" || !body.trim()) return new NextResponse("Mensaje vacío", { status: 400 });
  return NextResponse.json(await postMessage(viewer, eventId, body));
}
