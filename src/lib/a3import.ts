import { bumpLastCode, getA3Alta } from "./a3alta";
import { auditAdmin } from "./audit";
import { db } from "./db";
import { norm, readTable } from "./importStaff";

/**
 * Importa la «Base de Datos» de A3 (DNI, nombre, código, NASS y centro de cada trabajador) para
 * completar las fichas del personal que ya está en la app. Busca a cada uno por DNI y, si no, por
 * nombre. Solo rellena lo que falta: nunca cambia un código de A3 que ya tenga otro valor.
 */

type Col = "dni" | "name" | "code" | "nss" | "center";

function colFor(header: string): Col | null {
  const h = norm(header);
  if (/^(dni|nie|nif|dni nie|documento)$/.test(h)) return "dni";
  if (/^(codigo|cod|cod trabajador|codigo trabajador)$/.test(h)) return "code";
  if (/^(nass|nss|naf|n ss|num ss|seguridad social)$/.test(h)) return "nss";
  if (/^(centro|cod centro|codigo centro)$/.test(h)) return "center";
  if (/^(nombre|trabajador|nombre y apellidos|apellidos y nombre|empleado)$/.test(h)) return "name";
  return null;
}

const cleanDni = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** «FERRANDO PEREZ, BEATRIZ» y «Beatriz Ferrando Pérez» dan la misma clave. */
const nameKey = (s: string) => norm(s.replace(",", " ")).split(" ").filter(Boolean).sort().join(" ");

export type A3ImportResult = { ok: boolean; message: string; details?: string[] };

export async function importA3Database(file: File, by: string): Promise<A3ImportResult> {
  const table = await readTable(file);
  if ("error" in table) return { ok: false, message: table.error };
  let headerIdx = -1;
  let cols: (Col | null)[] = [];
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const c = table[i].map(colFor);
    if (c.includes("dni") && c.includes("code")) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (headerIdx < 0) return { ok: false, message: "No encuentro las columnas «DNI» y «CÓDIGO». Sube la hoja «Base de Datos» (DNI, Nombre, CÓDIGO, NASS, CENTRO)." };
  const at = (row: string[], c: Col) => (cols.indexOf(c) >= 0 ? (row[cols.indexOf(c)] ?? "").trim() : "");

  const workers = await db.worker.findMany({
    select: { id: true, name: true, dni: true, nss: true, a3Code: true, a3Center: true, firstName: true, surname1: true, surname2: true },
  });
  const byDni = new Map(workers.filter((w) => w.dni).map((w) => [cleanDni(w.dni!), w]));
  const byName = new Map<string, (typeof workers)[number] | null>();
  for (const w of workers) {
    const k = nameKey(w.name);
    byName.set(k, byName.has(k) ? null : w); // null = nombre repetido, no se usa
  }

  let rows = 0;
  let maxCode = 0;
  const updated: string[] = [];
  const conflicts: string[] = [];
  const matched = new Set<string>();
  for (const raw of table.slice(headerIdx + 1)) {
    const dni = cleanDni(at(raw, "dni"));
    const code = at(raw, "code");
    if (!dni && !code) continue;
    rows++;
    if (/^\d+$/.test(code)) maxCode = Math.max(maxCode, Number(code));
    const name = at(raw, "name");
    const w = (dni && byDni.get(dni)) || (name ? byName.get(nameKey(name)) : null);
    if (!w || matched.has(w.id)) continue;
    matched.add(w.id);
    const data: Record<string, string> = {};
    if (code && !w.a3Code) data.a3Code = code;
    else if (code && w.a3Code && w.a3Code.replace(/^0+/, "") !== code.replace(/^0+/, "")) conflicts.push(`${w.name}: en la app ${w.a3Code}, en A3 ${code}`);
    if (dni && !w.dni) data.dni = dni;
    const nss = at(raw, "nss");
    if (nss && !w.nss) data.nss = nss.replace(/\D/g, "");
    const center = at(raw, "center");
    if (center && !w.a3Center) data.a3Center = center;
    if (name.includes(",") && !w.firstName && !w.surname1) {
      const [surnames, first] = name.split(",").map((s) => s.trim());
      const [s1, ...rest] = surnames.split(/\s+/);
      if (first && s1) Object.assign(data, { firstName: first, surname1: s1, surname2: rest.join(" ") || "" });
    }
    if (Object.keys(data).length) {
      await db.worker.update({ where: { id: w.id }, data });
      updated.push(w.name);
    }
  }
  if (!rows) return { ok: false, message: "El archivo no tiene filas con DNI o código." };
  if (maxCode) await bumpLastCode(maxCode);
  const cfg = await getA3Alta();
  await auditAdmin(by, "A3", "Base de datos importada", `${rows} filas de A3: ${matched.size} encontrados en la app, ${updated.length} fichas completadas${conflicts.length ? `, ${conflicts.length} códigos distintos` : ""}`);
  const notInApp = rows - matched.size;
  return {
    ok: true,
    message:
      `${rows} trabajadores en el archivo. ${matched.size} están en la app y se han completado ${updated.length} fichas (código de A3, DNI, NASS, centro y apellidos que faltaban). ` +
      `${notInApp} no están dados de alta en la app (para entrar necesitan su teléfono; impórtalos desde Personal → Importar). ` +
      `El próximo código de alta será el ${cfg.lastCode + 1}.` +
      (conflicts.length ? ` Hay ${conflicts.length} con un código distinto en la app; no se han cambiado:` : ""),
    details: conflicts.slice(0, 30),
  };
}
