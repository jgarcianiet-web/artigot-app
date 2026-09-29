import { cookies } from "next/headers";
import { db } from "./db";

export const DEVICE_COOKIE = "device";

/** Al cerrar sesión, el dispositivo deja de recibir avisos de esa cuenta. */
export async function forgetDevice() {
  const jar = await cookies();
  const id = jar.get(DEVICE_COOKIE)?.value;
  if (id) await db.device.deleteMany({ where: { id } });
  jar.delete(DEVICE_COOKIE);
}
