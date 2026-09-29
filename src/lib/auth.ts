import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const COOKIE = "session";
const ADMIN_MAX_AGE = 60 * 60 * 24 * 14; // 14 días
const WORKER_MAX_AGE = 60 * 60 * 24 * 365; // 1 año: el trabajador no debería tener que volver a entrar

type Payload = { k: "a"; n: string; e: number } | { k: "w"; id: string; v: number; e: number };

export type Viewer =
  | { kind: "admin"; name: string }
  | { kind: "worker"; id: string; name: string; role: string };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET no configurado (mínimo 16 caracteres)");
  return s;
}

const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function writeSession(payload: Payload, maxAge: number) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
}

async function readSession(): Promise<Payload | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    return p.e > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

// ---------- RRHH ----------

export function checkPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(sign(password), sign(expected));
}

export async function createAdminSession(name: string) {
  await writeSession({ k: "a", n: name, e: Date.now() + ADMIN_MAX_AGE * 1000 }, ADMIN_MAX_AGE);
}

/** Nombre de la persona de RRHH con sesión, o null. */
export async function adminName() {
  const p = await readSession();
  return p?.k === "a" ? p.n : null;
}

export async function isAdmin() {
  return (await adminName()) !== null;
}

/** Para páginas y acciones de RRHH: redirige al login si no hay sesión. */
export async function requireAdmin() {
  const name = await adminName();
  if (name === null) redirect("/login");
  return name;
}

// ---------- Trabajadores ----------

/** Normaliza un teléfono a sus últimos 9 dígitos (formato español sin prefijo). */
export const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-9);

export const newAccessCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function workerLogin(phone: string, code: string): Promise<string | null> {
  const worker = await db.worker.findUnique({ where: { phoneKey: phoneKey(phone) } });
  const generic = "Teléfono o código incorrectos";
  if (!worker || !worker.active) return generic;
  if (worker.lockedUntil && worker.lockedUntil > new Date()) {
    return `Demasiados intentos. Vuelve a probar en unos minutos o pide a RRHH un código nuevo.`;
  }
  if (!safeEqual(sign(code.trim()), sign(worker.accessCode))) {
    const failed = worker.failedLogins + 1;
    await db.worker.update({
      where: { id: worker.id },
      data:
        failed >= MAX_FAILED
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLogins: failed },
    });
    return generic;
  }
  await db.worker.update({ where: { id: worker.id }, data: { failedLogins: 0, lockedUntil: null } });
  await writeSession(
    { k: "w", id: worker.id, v: worker.sessionVersion, e: Date.now() + WORKER_MAX_AGE * 1000 },
    WORKER_MAX_AGE,
  );
  return null;
}

/** Trabajador con sesión válida (activo y con la versión de sesión vigente), o null. */
export async function currentWorker() {
  const p = await readSession();
  if (p?.k !== "w") return null;
  const worker = await db.worker.findUnique({ where: { id: p.id } });
  if (!worker || !worker.active || worker.sessionVersion !== p.v) return null;
  return worker;
}

export async function requireWorker() {
  const worker = await currentWorker();
  if (!worker) redirect("/entrar");
  return worker;
}

/** Quien hace la petición, sea RRHH o trabajador. */
export async function currentViewer(): Promise<Viewer | null> {
  const name = await adminName();
  if (name !== null) return { kind: "admin", name };
  const w = await currentWorker();
  return w ? { kind: "worker", id: w.id, name: w.name, role: w.role } : null;
}
