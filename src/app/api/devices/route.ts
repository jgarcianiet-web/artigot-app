import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEVICE_COOKIE } from "@/lib/devices";


const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("web"),
    token: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  }),
  z.object({ kind: z.enum(["fcm", "apns"]), token: z.string().min(10).max(500) }),
]);

/** Registra este dispositivo para recibir avisos a nombre de quien tiene la sesión. */
export async function POST(req: Request) {
  const viewer = await currentViewer();
  if (!viewer) return new NextResponse("No autorizado", { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse("Datos no válidos", { status: 400 });
  const d = parsed.data;
  const owner =
    viewer.kind === "admin" ? { workerId: null, adminName: viewer.name } : { workerId: viewer.id, adminName: null };
  const keys = d.kind === "web" ? d.keys : undefined;
  const device = await db.device.upsert({
    where: { token: d.token },
    create: { kind: d.kind, token: d.token, keys, ...owner },
    update: { kind: d.kind, keys, ...owner },
  });
  (await cookies()).set(DEVICE_COOKIE, device.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
