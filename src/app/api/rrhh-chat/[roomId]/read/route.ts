import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { markStaffRead } from "@/lib/staffChat";

export async function POST(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const me = await currentAdmin();
  if (!me) return new NextResponse("No autorizado", { status: 403 });
  await markStaffRead(me.id, roomId);
  return new NextResponse(null, { status: 204 });
}
