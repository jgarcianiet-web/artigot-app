import { sseFromChannel } from "@/lib/sse";
import { groupChannel } from "@/lib/workerGroups";
import { groupAccess } from "../access";

export const dynamic = "force-dynamic";

/** Tiempo real del grupo: mensajes nuevos y «leído». */
export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!(await groupAccess(groupId))) return new Response("No autorizado", { status: 403 });
  return sseFromChannel(req, groupChannel(groupId), "staff");
}
