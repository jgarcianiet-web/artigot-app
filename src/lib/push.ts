import { createSign, type KeyObject, createPrivateKey } from "node:crypto";
import http2 from "node:http2";
import webpush from "web-push";
import { db } from "./db";
import { appUrl } from "./domain";
import { mailEnabled, sendMail } from "./mail";

/**
 * Envío de notificaciones push a los tres tipos de dispositivo:
 *  - web:  Web Push (navegadores y web app instalada en iPhone/Android) con claves VAPID
 *  - fcm:  app Android, vía Firebase Cloud Messaging (API HTTP v1)
 *  - apns: app iOS, directamente contra Apple Push Notification service
 * Web Push funciona siempre (claves VAPID propias o generadas); FCM y APNs, si sus variables están configuradas.
 */

type Push = { title: string; body: string; url: string; tag?: string };

const apnsEnabled = () => !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID);

type VapidKeys = { publicKey: string; privateKey: string };
let vapid: Promise<VapidKeys> | null = null;

/**
 * Claves VAPID de Web Push: las de las variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si están;
 * si no, se generan la primera vez y se guardan en la base de datos, para que los avisos funcionen
 * sin configurar nada (y las suscripciones sigan valiendo después de cada despliegue).
 */
export function vapidKeys(): Promise<VapidKeys> {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) return Promise.resolve({ publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY });
  vapid ??= (async () => {
    const saved = await db.setting.findUnique({ where: { key: "vapid" } });
    if (saved) return saved.value as VapidKeys;
    const keys = webpush.generateVAPIDKeys();
    // Si dos peticiones llegan a la vez, se queda la primera que se guardó
    await db.setting.createMany({ data: [{ key: "vapid", value: { publicKey: keys.publicKey, privateKey: keys.privateKey } }], skipDuplicates: true });
    return (await db.setting.findUniqueOrThrow({ where: { key: "vapid" } })).value as VapidKeys;
  })().catch((e) => {
    vapid = null;
    throw e;
  });
  return vapid;
}

export const pushConfig = async () => ({
  webPublicKey: (await vapidKeys().catch(() => null))?.publicKey ?? null,
  fcm: !!process.env.FCM_SERVICE_ACCOUNT,
  apns: apnsEnabled(),
});

export async function notify(opts: {
  workerIds?: string[];
  workerUrl?: string;
  admins?: boolean;
  /** Solo a estos usuarios de RRHH (por su nombre) */
  adminNames?: string[];
  excludeAdmin?: string;
  adminUrl?: string;
  title: string;
  body: string;
  tag?: string;
  /** A quien no tiene ningún móvil con avisos activados se le manda por email (si hay SMTP) */
  emailFallback?: boolean;
}) {
  if (opts.emailFallback && opts.workerIds?.length) await emailWithoutDevices(opts.workerIds, opts.title, opts.body, opts.workerUrl);
  const or = [];
  if (opts.workerIds?.length) or.push({ workerId: { in: opts.workerIds } });
  if (opts.admins) or.push({ workerId: null, adminName: { not: null } });
  if (opts.adminNames?.length) or.push({ workerId: null, adminName: { in: opts.adminNames } });
  if (!or.length) return;
  const devices = await db.device.findMany({ where: { OR: or } });
  const targets = devices.filter((d) => !(d.workerId === null && opts.excludeAdmin && d.adminName === opts.excludeAdmin));

  const results = await Promise.allSettled(
    targets.map((d) =>
      send(d, {
        title: opts.title,
        body: opts.body,
        tag: opts.tag,
        url: (d.workerId ? opts.workerUrl : opts.adminUrl) ?? "/",
      }),
    ),
  );
  const gone = targets.filter((_, i) => {
    const r = results[i];
    if (r.status === "rejected") console.error("push", targets[i].kind, r.reason);
    return r.status === "fulfilled" && r.value === "gone";
  });
  if (gone.length) await db.device.deleteMany({ where: { id: { in: gone.map((d) => d.id) } } });
}

/** Respaldo por email para quien no ha activado los avisos en ningún móvil. */
async function emailWithoutDevices(workerIds: string[], title: string, body: string, url?: string) {
  if (!mailEnabled()) return;
  const workers = await db.worker.findMany({ where: { id: { in: workerIds }, active: true, email: { not: null }, devices: { none: {} } }, select: { name: true, email: true } });
  for (const w of workers) {
    const text = [`Hola ${w.name.split(" ")[0]},`, "", body, "", `Entra en la app para responder: ${appUrl()}${url ?? "/app"}`, "", "Activa los avisos en la app para enterarte al momento."].join("\n");
    await sendMail(w.email!, title, text).catch((e) => console.error("email aviso", e));
  }
}

type Result = "ok" | "gone" | "skipped";

function send(d: { kind: string; token: string; keys: unknown }, p: Push): Promise<Result> {
  if (d.kind === "web") return sendWeb(d.token, d.keys as { p256dh: string; auth: string }, p);
  if (d.kind === "fcm") return sendFcm(d.token, p);
  if (d.kind === "apns") return sendApns(d.token, p);
  return Promise.resolve("skipped");
}

// ---------- Web Push ----------

async function sendWeb(endpoint: string, keys: { p256dh: string; auth: string }, p: Push): Promise<Result> {
  const { publicKey, privateKey } = await vapidKeys();
  try {
    await webpush.sendNotification({ endpoint, keys }, JSON.stringify(p), {
      vapidDetails: { subject: process.env.VAPID_SUBJECT || "mailto:rrhh@example.com", publicKey, privateKey },
      TTL: 60 * 60 * 24,
      urgency: "high",
      topic: p.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
    });
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    throw e;
  }
}

// ---------- Firebase Cloud Messaging (Android) ----------

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
let fcmToken: { value: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount {
  const raw = process.env.FCM_SERVICE_ACCOUNT!.trim();
  return JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString());
}

const b64url = (v: object | string) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

async function fcmAccessToken(sa: ServiceAccount) {
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.value;
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`FCM OAuth ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  fcmToken = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return fcmToken.value;
}

async function sendFcm(token: string, p: Push): Promise<Result> {
  if (!process.env.FCM_SERVICE_ACCOUNT) return "skipped";
  const sa = serviceAccount();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await fcmAccessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: p.title, body: p.body },
        data: { url: p.url },
        android: { priority: "high", notification: { tag: p.tag, sound: "default", channel_id: "avisos" } },
      },
    }),
  });
  if (res.ok) return "ok";
  const text = await res.text();
  if (res.status === 404 || text.includes("UNREGISTERED")) return "gone";
  throw new Error(`FCM ${res.status}: ${text}`);
}

// ---------- Apple Push Notification service (iOS) ----------

let apnsJwt: { value: string; exp: number } | null = null;
let apnsKey: KeyObject | null = null;

function apnsToken() {
  if (apnsJwt && apnsJwt.exp > Date.now()) return apnsJwt.value;
  apnsKey ??= createPrivateKey(process.env.APNS_KEY!.replace(/\\n/g, "\n"));
  const unsigned = `${b64url({ alg: "ES256", kid: process.env.APNS_KEY_ID })}.${b64url({
    iss: process.env.APNS_TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
  })}`;
  const signature = createSign("SHA256").update(unsigned).sign({ key: apnsKey, dsaEncoding: "ieee-p1363" }, "base64url");
  apnsJwt = { value: `${unsigned}.${signature}`, exp: Date.now() + 50 * 60_000 };
  return apnsJwt.value;
}

function sendApns(token: string, p: Push): Promise<Result> {
  if (!apnsEnabled()) return Promise.resolve("skipped");
  // Las builds de TestFlight y App Store usan el entorno de producción de APNs
  const host = process.env.APNS_SANDBOX === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  return new Promise((resolve, reject) => {
    const client = http2.connect(host);
    client.on("error", reject);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsToken()}`,
      "apns-topic": process.env.APNS_BUNDLE_ID!,
      "apns-push-type": "alert",
      "apns-priority": "10",
      ...(p.tag ? { "apns-collapse-id": p.tag.slice(0, 64) } : {}),
    });
    let status = 0;
    let body = "";
    req.on("response", (h) => (status = Number(h[":status"])));
    req.setEncoding("utf8");
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      client.close();
      if (status === 200) resolve("ok");
      else if (status === 410 || body.includes("BadDeviceToken") || body.includes("Unregistered")) resolve("gone");
      else reject(new Error(`APNs ${status}: ${body}`));
    });
    req.on("error", reject);
    req.end(
      JSON.stringify({
        aps: { alert: { title: p.title, body: p.body }, sound: "default", "thread-id": p.tag },
        url: p.url,
      }),
    );
  });
}
