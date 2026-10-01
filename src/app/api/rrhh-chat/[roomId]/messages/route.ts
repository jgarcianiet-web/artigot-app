import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { storeStaffImage } from "@/lib/files";
import { isMember, postStaffMessage, roomMessages } from "@/lib/staffChat";

export const dynamic = "force-dynamic";

async function authorize(roomId: string) {
  const me = await currentAdmin();
  return me && (await isMember(roomId, me.id)) ? me : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!(await authorize(roomId))) return new NextResponse("No autorizado", { status: 403 });
  return NextResponse.json(await roomMessages(roomId));
}

/** Texto (JSON) o foto (multipart). */
export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const me = await authorize(roomId);
  if (!me) return new NextResponse("No autorizado", { status: 403 });
  let body = "";
  let fileId: string | undefined;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData();
    body = String(form.get("body") ?? "");
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        fileId = (await storeStaffImage(file)).id;
      } catch (e) {
        return new NextResponse((e as Error).message, { status: 400 });
      }
    }
  } else {
    const json = (await req.json().catch(() => ({}))) as { body?: unknown };
    body = typeof json.body === "string" ? json.body : "";
  }
  const m = await postStaffMessage(me, roomId, body, fileId);
  if (!m) return new NextResponse("Mensaje vacío", { status: 400 });
  return NextResponse.json(m);
}
