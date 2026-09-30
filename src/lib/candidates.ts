import { headers } from "next/headers";
import { after } from "next/server";
import { newAccessCode, phoneKey } from "./auth";
import { db } from "./db";
import { isRole, ROLE_LABEL, type Role } from "./domain";
import { storeCandidateFile } from "./files";
import { notify } from "./push";

export const CANDIDATE_STATUS: Record<string, { label: string; cls: string }> = {
  NUEVO: { label: "Nuevo", cls: "bg-sky-100 text-sky-800" },
  CONTACTADO: { label: "Contactado", cls: "bg-amber-100 text-amber-800" },
  CONTRATADO: { label: "Dado de alta", cls: "bg-emerald-100 text-emerald-800" },
  DESCARTADO: { label: "Descartado", cls: "bg-stone-200 text-stone-600" },
};

// Límite sencillo contra envíos masivos: 3 solicitudes por IP cada 10 minutos (por instancia del servidor)
const recent = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  recent.set(ip, list);
  return list.length > 3;
}

export type ApplyResult = { ok: boolean; message: string } | null;

export async function applyAsCandidate(form: FormData): Promise<ApplyResult> {
  // Campo trampa: los humanos no lo ven; si viene relleno es un robot
  if (String(form.get("website") ?? "")) return { ok: true, message: "¡Gracias! Hemos recibido tu solicitud." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (tooMany(ip)) return { ok: false, message: "Has enviado varias solicitudes seguidas. Inténtalo más tarde." };

  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const phone = String(form.get("phone") ?? "").trim().slice(0, 30);
  const email = String(form.get("email") ?? "").trim().slice(0, 120) || null;
  const roles = form.getAll("roles").map(String).filter(isRole);
  if (name.length < 3) return { ok: false, message: "Escribe tu nombre y apellidos." };
  if (phoneKey(phone).length < 9) return { ok: false, message: "Escribe un teléfono de contacto válido." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "El email no es válido." };
  if (!roles.length) return { ok: false, message: "Marca al menos un puesto." };
  if (form.get("consent") !== "1") return { ok: false, message: "Tienes que aceptar el tratamiento de tus datos para poder enviarla." };

  const existing = await db.candidate.findFirst({ where: { phoneKey: phoneKey(phone), status: { in: ["NUEVO", "CONTACTADO"] } } });
  if (existing) return { ok: true, message: "Ya teníamos tu solicitud. Te contactaremos pronto." };

  let fileId: string | undefined;
  const file = form.get("cv");
  if (file instanceof File && file.size > 0) {
    try {
      fileId = (await storeCandidateFile(file)).id;
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
  const c = await db.candidate.create({
    data: {
      name,
      phone,
      phoneKey: phoneKey(phone),
      email,
      zone: String(form.get("zone") ?? "").trim().slice(0, 80) || null,
      roles,
      experience: String(form.get("experience") ?? "").trim().slice(0, 2000) || null,
      availability: String(form.get("availability") ?? "").trim().slice(0, 500) || null,
      fileId,
      consentAt: new Date(),
    },
  });
  after(() =>
    notify({
      admins: true,
      adminUrl: `/admin/candidatos/${c.id}`,
      title: "Nuevo candidato",
      body: `${name} · ${roles.map((r) => ROLE_LABEL[r as Role]).join(", ")}${c.zone ? ` · ${c.zone}` : ""}`,
      tag: "candidatos",
    }),
  );
  return { ok: true, message: "¡Gracias! Hemos recibido tu solicitud. Te llamaremos cuando haya eventos en tu zona." };
}

/** Da de alta al candidato como trabajador (o lo enlaza si ya existía con ese teléfono). */
export async function hireCandidate(id: string, role: Role) {
  const c = await db.candidate.findUniqueOrThrow({ where: { id } });
  const key = phoneKey(c.phone);
  const roles = [...new Set([role, ...c.roles.filter(isRole)])];
  const worker =
    (await db.worker.findUnique({ where: { phoneKey: key } })) ??
    (await db.worker.create({
      data: { name: c.name, phone: c.phone, phoneKey: key, email: c.email, zone: c.zone, role, roles, accessCode: newAccessCode(), notes: c.experience },
    }));
  await db.candidate.update({ where: { id }, data: { status: "CONTRATADO", workerId: worker.id } });
  return worker;
}
