import { NextResponse } from "next/server";
import { markDmRead } from "@/lib/workerChat";
import { dmAccess } from "../access";

export async function POST(_req: Request, { params }: { params: Promise<{ workerId: string }> }) {
  const { workerId } = await params;
  const me = await dmAccess(workerId);
  if (!me) return new NextResponse("No autorizado", { status: 403 });
  await markDmRead(me.side, workerId);
  return new NextResponse(null, { status: 204 });
}
