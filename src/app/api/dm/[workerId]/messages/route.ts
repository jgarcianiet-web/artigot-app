import { NextResponse } from "next/server";
import { storeDmImage } from "@/lib/files";
import { dmMessages, dmReads, postDm } from "@/lib/workerChat";
import { dmAccess } from "../access";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ workerId: string }> }) {
  const { workerId } = await params;
  if (!(await dmAccess(workerId))) return new NextResponse("No autorizado", { status: 403 });
  return NextResponse.json({ messages: await dmMessages(workerId), reads: await dmReads(workerId) });
}

/** Texto (JSON) o foto (multipart). */
export async function POST(req: Request, { params }: { params: Promise<{ workerId: string }> }) {
  const { workerId } = await params;
  const me = await dmAccess(workerId);
  if (!me) return new NextResponse("No autorizado", { status: 403 });
  let body = "";
  let fileId: string | undefined;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData();
    body = String(form.get("body") ?? "");
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        fileId = (await storeDmImage(file, workerId)).id;
      } catch (e) {
        return new NextResponse((e as Error).message, { status: 400 });
      }
    }
  } else {
    const json = (await req.json().catch(() => ({}))) as { body?: unknown };
    body = typeof json.body === "string" ? json.body : "";
  }
  const m = await postDm(me, workerId, body, fileId);
  if (!m) return new NextResponse("Mensaje vacío", { status: 400 });
  return NextResponse.json(m);
}
