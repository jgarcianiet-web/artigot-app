import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storeGroupImage } from "@/lib/files";
import { groupMessages, groupReads, postGroup } from "@/lib/workerGroups";
import { groupAccess } from "../access";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!(await groupAccess(groupId))) return new NextResponse("No autorizado", { status: 403 });
  return NextResponse.json({ messages: await groupMessages(groupId), reads: await groupReads(groupId) });
}

/** Texto (JSON) o foto (multipart). */
export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const me = await groupAccess(groupId);
  if (!me) return new NextResponse("No autorizado", { status: 403 });
  // En los grupos de avisos solo escribe RRHH (antes de guardar ninguna foto)
  if (me.side === "worker" && (await db.workerGroup.findUnique({ where: { id: groupId }, select: { onlyStaff: true } }))?.onlyStaff)
    return new NextResponse("En este grupo solo escribe RRHH.", { status: 403 });
  let body = "";
  let file: File | null = null;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData();
    body = String(form.get("body") ?? "");
    const f = form.get("file");
    if (f instanceof File && f.size > 0) file = f;
  } else {
    const json = (await req.json().catch(() => ({}))) as { body?: unknown };
    body = typeof json.body === "string" ? json.body : "";
  }
  try {
    const fileId = file ? (await storeGroupImage(file, groupId)).id : undefined;
    const m = await postGroup(me, groupId, body, fileId);
    if (!m) return new NextResponse("Mensaje vacío", { status: 400 });
    return NextResponse.json(m);
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 400 });
  }
}
