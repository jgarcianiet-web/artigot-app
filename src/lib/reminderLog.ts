import { Prisma } from "@prisma/client";
import { db } from "./db";

/** Reserva la clave del aviso; devuelve false si ya se había enviado. */
export async function claim(key: string) {
  try {
    await db.reminderLog.create({ data: { key } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}
