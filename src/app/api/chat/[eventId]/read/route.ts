import { currentViewer } from "@/lib/auth";
import { canAccessChat, markRead } from "@/lib/chat";

export async function POST(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const viewer = await currentViewer();
  if (!viewer || !(await canAccessChat(viewer, eventId))) return new Response("No autorizado", { status: 403 });
  await markRead(viewer, eventId);
  return new Response(null, { status: 204 });
}
