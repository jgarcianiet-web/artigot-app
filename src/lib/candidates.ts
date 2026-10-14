import { headers } from "next/headers";
import { after } from "next/server";
import { newAccessCode, phoneKey } from "./auth";
import { db } from "./db";
import { isRole, ROLE_LABEL, type Role } from "./domain";
import { deleteStoredFile, storeCandidateFile } from "./files";
import { mailEnabled, sendMail } from "./mail";
import { notify } from "./push";

export const CANDIDATE_STATUS: Record<string, { label: string; cls: string }> = {
  NUEVO: { label: "Nuevo", cls: "bg-sky-100 text-sky-800" },
  CONTACTADO: { label: "Contactado", cls: "bg-amber-100 text-amber-800" },
  ENTREVISTA: { label: "Entrevista", cls: "bg-violet-100 text-violet-800" },
  CONTRATADO: { label: "Dado de alta", cls: "bg-emerald-100 text-emerald-800" },
  DESCARTADO: { label: "Descartado", cls: "bg-stone-200 text-stone-600" },
};

// Límite sencillo contra envíos masivos: 3 solicitudes guardadas por IP cada 10 minutos (por instancia del servidor).
// Los envíos con errores (falta un dato) no cuentan, para no bloquear a quien se equivoca al rellenarlo.
const recent = new Map<string, number[]>();
function tooMany(ip: string) {
  const list = (recent.get(ip) ?? []).filter((t) => Date.now() - t < 10 * 60_000);
  recent.set(ip, list);
  return list.length >= 3;
}
const countSubmission = (ip: string) => recent.set(ip, [...(recent.get(ip) ?? []), Date.now()]);

/** Candidaturas en curso (ni dadas de alta ni descartadas). */
export const OPEN_STATUSES = ["NUEVO", "CONTACTADO", "ENTREVISTA"];
/** Meses que se guardan los datos de quien no llega a trabajar con nosotros (después se borran solos). */
export const CANDIDATE_RETENTION_MONTHS = 12;

const first = (name: string) => name.trim().split(/\s+/)[0];
const dateTime = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

/** Mensajes ya escritos para mandar por WhatsApp desde la ficha del candidato. */
export function candidateMessages(c: { name: string; roles: string[]; interviewAt: Date | null }, place: string) {
  const roles = c.roles.map((r) => ROLE_LABEL[r as Role]?.toLowerCase() ?? r).join(" o ") || "nuestros eventos";
  return {
    contact: `Hola ${first(c.name)}, somos Artigot Catering. Hemos recibido tu solicitud para trabajar como ${roles}. ¿Cuándo te viene bien que te llamemos para conocerte?`,
    interview: c.interviewAt
      ? `Hola ${first(c.name)}, te esperamos el ${dateTime(c.interviewAt)} para la entrevista${place ? ` en ${place}` : ""}. Si no puedes, avísanos por aquí. ¡Gracias!`
      : null,
    discard: `Hola ${first(c.name)}, gracias por tu interés en trabajar con Artigot. De momento no podemos contar contigo, pero guardamos tu solicitud por si surge algo más adelante. ¡Un saludo!`,
  };
}

export type ApplyResult = { ok: boolean; message: string } | null;

/** Puestos a los que se puede optar desde la solicitud pública. */
export const APPLY_ROLES: Role[] = ["CAMARERO", "MOZO"];

export async function applyAsCandidate(form: FormData): Promise<ApplyResult> {
  // Campo trampa: los humanos no lo ven; si viene relleno es un robot
  if (String(form.get("website") ?? "")) return { ok: true, message: "¡Gracias! Hemos recibido tu solicitud." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (tooMany(ip)) return { ok: false, message: "Has enviado varias solicitudes seguidas. Inténtalo más tarde." };

  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const phone = String(form.get("phone") ?? "").trim().slice(0, 30);
  const email = String(form.get("email") ?? "").trim().slice(0, 120);
  const roles = form.getAll("roles").map(String).filter((r): r is Role => isRole(r) && APPLY_ROLES.includes(r));
  const car = String(form.get("hasCar") ?? "");
  if (name.length < 3) return { ok: false, message: "Escribe tu nombre y apellidos." };
  if (phoneKey(phone).length < 9) return { ok: false, message: "Escribe un teléfono de contacto válido." };
  if (!email) return { ok: false, message: "Escribe tu email." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "El email no es válido." };
  if (!roles.length) return { ok: false, message: "Marca al menos un puesto." };
  if (car !== "1" && car !== "0") return { ok: false, message: "Indica si tienes coche." };
  if (form.get("consent") !== "1") return { ok: false, message: "Tienes que aceptar el tratamiento de tus datos para poder enviarla." };

  const existing = await db.candidate.findFirst({ where: { phoneKey: phoneKey(phone), status: { in: OPEN_STATUSES } } });
  if (existing) return { ok: true, message: "Ya teníamos tu solicitud. Te contactaremos pronto." };

  const file = form.get("cv");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Adjunta tu currículum (PDF o foto)." };
  let fileId: string;
  try {
    fileId = (await storeCandidateFile(file)).id;
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  countSubmission(ip);
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
      hasCar: car === "1",
      fileId,
      consentAt: new Date(),
    },
  });
  after(() =>
    notify({
      admins: true,
      adminUrl: `/admin/candidatos/${c.id}`,
      title: "Nuevo candidato",
      body: `${name} · ${roles.map((r) => ROLE_LABEL[r as Role]).join(", ")}${c.zone ? ` · ${c.zone}` : ""}${c.hasCar ? " · con coche" : ""}`,
      tag: "candidatos",
    }),
  );
  // Acuse de recibo al candidato (si el correo está configurado)
  if (mailEnabled()) {
    after(() =>
      sendMail(
        email,
        "Hemos recibido tu solicitud · Artigot",
        `Hola ${first(name)},\n\nGracias por querer trabajar con Artigot Catering. Hemos recibido tu solicitud y la revisaremos pronto; si encaja, te llamaremos al ${phone}.\n\nGuardamos tus datos solo para este proceso, un máximo de ${CANDIDATE_RETENTION_MONTHS} meses. Si quieres que los borremos antes, responde a este email.`,
      ).catch((e) => console.error("acuse candidato", e)),
    );
  }
  return { ok: true, message: "¡Gracias! Hemos recibido tu solicitud. Te llamaremos cuando haya eventos en tu zona." };
}

/**
 * Da de alta al candidato como trabajador (o lo enlaza si ya existía con ese teléfono). Se lleva a su ficha la
 * valoración de la entrevista (punto de partida de su puntuación), la experiencia y las notas, y el CV queda
 * entre sus documentos.
 */
export async function hireCandidate(id: string, role: Role, by = "RRHH") {
  const c = await db.candidate.findUniqueOrThrow({ where: { id } });
  const key = phoneKey(c.phone);
  const roles = [...new Set([role, ...c.roles.filter(isRole)])];
  const notes = [c.experience && `Experiencia: ${c.experience}`, c.availability && `Disponibilidad: ${c.availability}`, c.notes && `Entrevista: ${c.notes}`]
    .filter(Boolean)
    .join("\n") || null;
  const existing = await db.worker.findUnique({ where: { phoneKey: key } });
  const worker =
    existing ??
    (await db.worker.create({
      data: {
        name: c.name, phone: c.phone, phoneKey: key, email: c.email, zone: c.zone, role, roles, accessCode: newAccessCode(), notes,
        ...(c.rating && { rating: c.rating }),
        // Con coche: se le proponen 3 plazas por defecto al elegir «Llevo coche» (las puede cambiar)
        ...(c.hasCar && { carSeats: 3 }),
      },
    }));
  // El CV pasa a sus documentos (lo ven RRHH y el propio trabajador)
  if (c.fileId && !(await db.workerDocument.findUnique({ where: { fileId: c.fileId } }))) {
    await db.storedFile.update({ where: { id: c.fileId }, data: { scope: "DOC", workerId: worker.id } });
    await db.workerDocument.create({ data: { workerId: worker.id, type: "OTRO", label: "Currículum", fileId: c.fileId, uploadedBy: by, verified: true } });
  }
  await db.candidate.update({ where: { id }, data: { status: "CONTRATADO", workerId: worker.id } });
  return worker;
}

/** Borra los datos de quien no llegó a trabajar con nosotros pasado el plazo de conservación. */
export async function purgeOldCandidates(now = new Date()) {
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - CANDIDATE_RETENTION_MONTHS);
  const old = await db.candidate.findMany({ where: { workerId: null, createdAt: { lt: limit } }, select: { id: true, fileId: true } });
  for (const c of old) {
    await db.candidate.delete({ where: { id: c.id } });
    if (c.fileId) await deleteStoredFile(c.fileId);
  }
  return old.length;
}
