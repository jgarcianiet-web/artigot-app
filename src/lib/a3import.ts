import { bumpLastCode, getA3Alta } from "./a3alta";
import { auditAdmin } from "./audit";
import { phoneKey } from "./auth";
import { incompleteWorkers } from "./completeness";
import { db } from "./db";
import { parseDate } from "./employment";
import { norm, readTable } from "./importStaff";
import { validDniNie, validIban } from "./staff";

/**
 * Completa las fichas del personal con cualquier Excel o CSV (la «Base de Datos» de A3, una lista
 * exportada de otro programa…). Busca a cada persona por DNI, teléfono, email o nombre y solo
 * rellena lo que falta: nunca cambia un dato que ya esté puesto. Lo que siga faltando se le pide al
 * trabajador en la app (recordatorio automático de datos incompletos).
 */

type Col = "dni" | "name" | "surname" | "phone" | "email" | "code" | "nss" | "center" | "iban" | "birth" | "address" | "sex" | "nationality" | "zone";

function colFor(header: string): Col | null {
  const h = norm(header);
  if (!h) return null;
  if (/^(dni|nie|nif|dni nie|nif nie|documento|n documento|num documento)$/.test(h)) return "dni";
  if (/^(codigo|cod|cod trabajador|codigo trabajador|codigo a3|cod a3)$/.test(h)) return "code";
  if (/^(nass|nss|naf|n ss|num ss|seguridad social|n seguridad social|numero seguridad social|n afiliacion|afiliacion)$/.test(h)) return "nss";
  if (/^(centro|cod centro|codigo centro)$/.test(h)) return "center";
  if (/^(iban|cuenta|cuenta bancaria|n cuenta|ccc)$/.test(h)) return "iban";
  if (/(nacimiento|fecha nac)/.test(h)) return "birth";
  if (/^(direccion|domicilio)$/.test(h)) return "address";
  if (/^(sexo|genero)$/.test(h)) return "sex";
  if (/^(nacionalidad|pais)$/.test(h)) return "nationality";
  if (/^(zona|localidad|poblacion|ciudad|municipio)$/.test(h)) return "zone";
  if (/\b(telefono|movil|tlf|telf)\b/.test(h)) return "phone";
  if (/\b(email|e mail|correo|mail)\b/.test(h)) return "email";
  if (/^(apellidos|apellido|primer apellido)$/.test(h)) return "surname";
  if (/^(nombre|trabajador|nombre y apellidos|apellidos y nombre|nombre completo|empleado)$/.test(h)) return "name";
  return null;
}

const cleanDni = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** «FERRANDO PEREZ, BEATRIZ» y «Beatriz Ferrando Pérez» dan la misma clave. */
const nameKey = (s: string) => norm(s.replace(",", " ")).split(" ").filter(Boolean).sort().join(" ");

const FIELD_LABEL: Record<string, string> = {
  a3Code: "código A3", dni: "DNI", nss: "NSS", a3Center: "centro", iban: "IBAN", phone: "teléfono", email: "email",
  birthDate: "nacimiento", address: "dirección", sex: "sexo", nationality: "nacionalidad", zone: "zona", firstName: "apellidos",
};

export type A3ImportResult = { ok: boolean; message: string; details?: string[] };

export async function completeFromFile(file: File, by: string): Promise<A3ImportResult> {
  const table = await readTable(file);
  if ("error" in table) return { ok: false, message: table.error };
  let headerIdx = -1;
  let cols: (Col | null)[] = [];
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const c = table[i].map(colFor);
    const keys = ["dni", "phone", "email", "name"].filter((k) => c.includes(k as Col)).length;
    if (keys >= 1 && c.filter(Boolean).length >= 2) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (headerIdx < 0) return { ok: false, message: "No reconozco las columnas. La primera fila debe tener cabeceras como «DNI», «Nombre», «Teléfono», «Email», «NSS», «IBAN» o «CÓDIGO»." };
  const at = (row: string[], c: Col) => cols.map((x, i) => (x === c ? (row[i] ?? "").trim() : "")).filter(Boolean).join(" ").trim();

  const workers = await db.worker.findMany({
    select: {
      id: true, name: true, dni: true, nss: true, a3Code: true, a3Center: true, firstName: true, surname1: true, surname2: true, phone: true, phoneKey: true,
      email: true, iban: true, birthDate: true, address: true, sex: true, nationality: true, zone: true,
    },
  });
  const byDni = new Map(workers.filter((w) => w.dni).map((w) => [cleanDni(w.dni!), w]));
  const byPhone = new Map(workers.filter((w) => w.phoneKey).map((w) => [w.phoneKey!, w]));
  const byEmail = new Map<string, (typeof workers)[number] | null>();
  const byName = new Map<string, (typeof workers)[number] | null>();
  for (const w of workers) {
    const k = nameKey(w.name);
    byName.set(k, byName.has(k) ? null : w); // null = nombre repetido, no se usa
    if (w.email) byEmail.set(w.email.toLowerCase(), byEmail.has(w.email.toLowerCase()) ? null : w);
  }
  const phoneOwners = new Set(byPhone.keys());

  let rows = 0;
  let maxCode = 0;
  const updated: string[] = [];
  const conflicts: string[] = [];
  const filled: Record<string, number> = {};
  const matched = new Set<string>();
  for (const raw of table.slice(headerIdx + 1)) {
    const dni = cleanDni(at(raw, "dni"));
    const phone = at(raw, "phone");
    const email = at(raw, "email").toLowerCase();
    const name = [at(raw, "name"), at(raw, "surname")].filter(Boolean).join(" ");
    if (!dni && !phone && !email && !name) continue;
    rows++;
    const code = at(raw, "code");
    if (/^\d+$/.test(code)) maxCode = Math.max(maxCode, Number(code));
    const key = phone ? phoneKey(phone) : "";
    const w =
      (dni && byDni.get(dni)) || (key.length >= 9 && byPhone.get(key)) || (email && byEmail.get(email)) || (name ? byName.get(nameKey(name)) : null);
    if (!w || matched.has(w.id)) continue;
    matched.add(w.id);

    const data: Record<string, string> = {};
    const put = (field: keyof typeof w, value: string | null | undefined) => {
      if (value && !w[field]) data[field] = value;
    };
    if (code && !w.a3Code) data.a3Code = code;
    else if (code && w.a3Code && w.a3Code.replace(/^0+/, "") !== code.replace(/^0+/, "")) conflicts.push(`${w.name}: código en la app ${w.a3Code}, en el archivo ${code}`);
    if (dni && validDniNie(dni)) put("dni", dni);
    const nss = at(raw, "nss").replace(/\D/g, "");
    if (nss.length >= 11) put("nss", nss);
    put("a3Center", at(raw, "center"));
    const iban = at(raw, "iban").toUpperCase().replace(/\s/g, "");
    if (iban && validIban(iban)) put("iban", iban);
    if (key.length >= 9 && !w.phoneKey && !phoneOwners.has(key)) {
      data.phone = phone;
      data.phoneKey = key;
      phoneOwners.add(key);
    }
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) put("email", email);
    put("birthDate", parseDate(at(raw, "birth")));
    put("address", at(raw, "address"));
    const sex = norm(at(raw, "sex"));
    put("sex", /^(h|hombre|varon|m|masculino)$/.test(sex) ? "Hombre" : /^(mujer|f|femenino)$/.test(sex) ? "Mujer" : null);
    put("nationality", at(raw, "nationality").toLocaleUpperCase("es-ES"));
    put("zone", at(raw, "zone"));
    if (name.includes(",") && !w.firstName && !w.surname1) {
      const [surnames, first] = name.split(",").map((s) => s.trim());
      const [s1, ...rest] = surnames.split(/\s+/);
      if (first && s1) Object.assign(data, { firstName: first, surname1: s1, surname2: rest.join(" ") || "" });
    }
    if (Object.keys(data).length) {
      await db.worker.update({ where: { id: w.id }, data });
      updated.push(w.name);
      for (const k of Object.keys(data)) if (FIELD_LABEL[k]) filled[FIELD_LABEL[k]] = (filled[FIELD_LABEL[k]] ?? 0) + 1;
    }
  }
  if (!rows) return { ok: false, message: "El archivo no tiene filas con datos." };
  if (maxCode) await bumpLastCode(maxCode);
  await auditAdmin(by, "Trabajador", "Completar datos", `${rows} filas: ${matched.size} encontrados en la app, ${updated.length} fichas completadas${conflicts.length ? `, ${conflicts.length} códigos distintos` : ""}`);
  const stillMissing = (await incompleteWorkers()).length;
  const what = Object.entries(filled).map(([k, n]) => `${n} ${k}`).join(", ");
  const nextCode = maxCode ? ` El próximo código de alta en A3 será el ${(await getA3Alta()).lastCode + 1}.` : "";
  return {
    ok: true,
    message:
      `${rows} personas en el archivo. ${matched.size} están en la app y se han completado ${updated.length} fichas${what ? ` (${what})` : ""}. ` +
      `${rows - matched.size} no están en la app (impórtalas arriba si deben estar).` +
      nextCode +
      ` ${stillMissing ? `A ${stillMissing} les sigue faltando algo: la app se lo pide automáticamente.` : "Ya no le falta nada a nadie."}` +
      (conflicts.length ? ` Hay ${conflicts.length} con un código distinto en la app; no se han cambiado:` : ""),
    details: conflicts.slice(0, 30),
  };
}

/** La «Base de Datos» de A3 es un caso particular. */
export const importA3Database = completeFromFile;
