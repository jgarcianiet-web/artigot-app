import { NextResponse } from "next/server";
import { markGroupRead } from "@/lib/workerGroups";
import { groupAccess } from "../access";

export async function POST(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const me = await groupAccess(groupId);
  if (!me) return new NextResponse("No autorizado", { status: 403 });
  await markGroupRead(me, groupId);
  return new NextResponse(null, { status: 204 });
}
