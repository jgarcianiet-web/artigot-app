import { currentViewer } from "@/lib/auth";
import { canAccessChat, markRead } from "@/lib/chat";

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const groupId = new URL(req.url).searchParams.get("grupo") || null;
  const viewer = await currentViewer();
  if (!viewer || !(await canAccessChat(viewer, eventId, groupId))) return new Response("No autorizado", { status: 403 });
  await markRead(viewer, eventId, new Date(), groupId);
  return new Response(null, { status: 204 });
}
