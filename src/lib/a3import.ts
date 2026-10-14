import { bumpLastCode, getA3Alta } from "./a3alta";
import { auditAdmin } from "./audit";
import { newAccessCode, phoneKey } from "./auth";
import { incompleteWorkers } from "./completeness";
import { db } from "./db";
import { parseDate } from "./employment";
import { parseContract, type Role } from "./domain";
import { norm, parseRole, readTable } from "./importStaff";
import { validDniNie, validIban } from "./staff";

/**
 * Importa el personal desde A3 (la «Base de Datos» u otro listado de trabajadores exportado de A3, en Excel o CSV).
 * Busca a cada persona por DNI, teléfono, email o nombre:
 * - si ya está en la app, rellena solo lo que le falta (nunca cambia un dato que ya esté puesto);
 * - si no está (y se pide crearla), da de alta su ficha con su código de acceso a la app.
 * Con `dryRun` no guarda nada: solo dice qué haría. Lo que siga faltando se le pide al trabajador en la app.
 */

type Col = "dni" | "name" | "first" | "surname" | "surname2" | "phone" | "email" | "code" | "nss" | "center" | "iban" | "birth" | "address" | "sex" | "nationality" | "zone" | "rateBODA" | "rateEVENTO" | "rateOTRO" | "rateAll" | "rateMAITRE:BODA" | "rateMAITRE:EVENTO" | "rateMAITRE:OTRO" | "rateMAITRE:ALL" | "contract" | "role";

function colFor(header: string): Col | null {
  const h = norm(header);
  if (!h) return null;
  if (/^(dni|nie|nif|dni nie|nif nie|documento|n documento|num documento)$/.test(h)) return "dni";
  // Tarifa propia (€/hora): «Tarifa boda», «Precio hora evento», «Maître boda», «Tarifa maître» o
  // «Tarifa» para todos. Las columnas que se llaman solo «Boda» o «Evento» también valen.
  const bare = /^(boda|bodas|evento|eventos|otro|otros|maitre|maitres)( (boda|bodas|evento|eventos|otro|otros|maitre|maitres))?$/.test(h);
  if ((bare || /\b(tarifa|precio|eur|euros)\b/.test(h)) && !/\b(total|importe)\b/.test(h)) {
    const pre = /\bmaitres?\b/.test(h) ? "rateMAITRE:" : "rate";
    if (/\bbodas?\b/.test(h)) return `${pre}BODA` as Col;
    if (/\beventos?\b/.test(h)) return `${pre}EVENTO` as Col;
    if (/\botros?\b/.test(h)) return `${pre}OTRO` as Col;
    if (pre !== "rate") return "rateMAITRE:ALL";
    if (/^(tarifa|tarifa hora|tarifa propia|precio|precio hora|eur hora|euros hora|eur h)$/.test(h)) return "rateAll";
  }
  if (/^(tipo de contrato|tipo contrato|contrato|cod contrato|codigo contrato)$/.test(h)) return "contract";
  if (/^(puesto|categoria|cargo|puesto de trabajo|categoria profesional)$/.test(h)) return "role";
  if (/^(codigo|cod|cod trabajador|codigo trabajador|cod empleado|codigo empleado|n empleado|codigo a3|cod a3)$/.test(h)) return "code";
  if (/^(nass|nss|naf|n ss|num ss|seguridad social|n seguridad social|numero seguridad social|n afiliacion|afiliacion)$/.test(h)) return "nss";
  if (/^(centro|cod centro|codigo centro)$/.test(h)) return "center";
  if (/^(iban|cuenta|cuenta bancaria|n cuenta|ccc)$/.test(h)) return "iban";
  if (/^lugar/.test(h)) return null; // «Lugar de nacimiento»
  if (/(nacimiento|fecha nac)/.test(h)) return "birth";
  if (/^(direccion|domicilio)$/.test(h)) return "address";
  if (/^(sexo|genero)$/.test(h)) return "sex";
  if (/^(nacionalidad|pais)$/.test(h)) return "nationality";
  if (/^(zona|localidad|poblacion|ciudad|municipio)$/.test(h)) return "zone";
  if (/\b(telefono|movil|tlf|telf)\b/.test(h)) return "phone";
  if (/\b(email|e mail|correo|mail)\b/.test(h)) return "email";
  if (/^(segundo apellido|apellido 2|2 apellido)$/.test(h)) return "surname2";
  if (/^(apellidos|apellido|primer apellido|apellido 1|1 apellido)$/.test(h)) return "surname";
  // A3 «Datos Identificativos»: «Nom. Trabajador» es el nombre de pila (los apellidos van aparte)
  if (/^(nom trabajador|nombre de pila|nombre propio)$/.test(h)) return "first";
  if (/^(nombre|trabajador|nombre y apellidos|apellidos y nombre|nombre completo|empleado)$/.test(h)) return "name";
  return null;
}

const cleanDni = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** «FERRANDO PEREZ, BEATRIZ» y «Beatriz Ferrando Pérez» dan la misma clave. */
const nameKey = (s: string) => norm(s.replace(",", " ")).split(" ").filter(Boolean).sort().join(" ");

const FIELD_LABEL: Record<string, string> = {
  a3Code: "código A3", dni: "DNI", nss: "NSS", a3Center: "centro", iban: "IBAN", phone: "teléfono", email: "email",
  birthDate: "nacimiento", address: "dirección", sex: "sexo", nationality: "nacionalidad", zone: "zona", firstName: "apellidos", customRates: "tarifa propia",
  contractCode: "tipo de contrato",
};

export type A3ImportResult = { ok: boolean; message: string; details?: string[]; preview?: boolean };

const LOWER = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos", "van", "von"]);
/** «FERRANDO PEREZ, BEATRIZ» → «Beatriz Ferrando Perez» (A3 guarda los nombres en mayúsculas y con los apellidos delante). */
export function a3Name(raw: string) {
  const cap = (t: string) =>
    t
      .toLocaleLowerCase("es-ES")
      .split(/\s+/)
      .filter(Boolean)
      .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.replace(/(^|[-'])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase("es-ES"))))
      .join(" ");
  if (!raw.includes(",")) return { name: cap(raw) };
  const [surnames, first] = raw.split(",").map((x) => x.trim());
  const [s1, ...rest] = cap(surnames).split(" ");
  const firstName = cap(first);
  // «del», «de la»… en minúscula también cuando el apellido va detrás del nombre («Lucía del Castillo»)
  return { name: cap([first, surnames].filter(Boolean).join(" ")), firstName, surname1: s1, surname2: rest.join(" ") };
}

/** Nombre de pila y apellidos por separado (A3 «Datos Identificativos»), en mayúsculas → «Patricia Gomez Aparisi». */
function a3Parts(first: string, s1: string, s2: string) {
  const c = (x: string) => (x ? a3Name(x).name : "");
  const [firstName, surname1, surname2] = [c(first), c(s1), c(s2)];
  return { name: a3Name([first, s1, s2].filter(Boolean).join(" ")).name, firstName, surname1, surname2 };
}

export type A3ImportOptions = { replaceRates?: boolean; create?: boolean; dryRun?: boolean; defaultRole?: Role };

const rateValue = (v: string) => {
  const n = Number(v.replace(/[€\s]/g, "").replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 && n < 500 ? Math.round(n * 1000) / 1000 : null;
};

export async function completeFromFile(file: File, by: string, opts: A3ImportOptions = {}): Promise<A3ImportResult> {
  const table = await readTable(file);
  if ("error" in table) return { ok: false, message: table.error };
  let headerIdx = -1;
  let cols: (Col | null)[] = [];
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const c = table[i].map(colFor);
    const keys = ["dni", "phone", "email", "name", "first", "code"].filter((k) => c.includes(k as Col)).length;
    if (keys >= 1 && c.filter(Boolean).length >= 2) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (headerIdx < 0)
    return { ok: false, message: "No reconozco las columnas. Debe tener cabeceras como «DNI», «Cód. Trabajador», «Nom. Trabajador», «Primer Apellido», «NAF», «Cod. Centro», «Teléfono» o «Email»." };
  const at = (row: string[], c: Col) => cols.map((x, i) => (x === c ? (row[i] ?? "").trim() : "")).filter(Boolean).join(" ").trim();

  const workers = await db.worker.findMany({
    select: {
      id: true, name: true, dni: true, nss: true, a3Code: true, a3Center: true, firstName: true, surname1: true, surname2: true, phone: true, phoneKey: true,
      email: true, iban: true, birthDate: true, address: true, sex: true, nationality: true, zone: true, customRates: true, contractCode: true,
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
  const codeKey = (c: string) => c.replace(/^0+/, "");
  const byCode = new Map(workers.filter((w) => w.a3Code).map((w) => [codeKey(w.a3Code!), w]));

  let rows = 0;
  let maxCode = 0;
  const updated: string[] = [];
  const conflicts: string[] = [];
  const filled: Record<string, number> = {};
  const matched = new Set<string>();
  const created: string[] = [];
  const cannot: string[] = [];
  const seen = new Set<string>();
  const noDni: string[] = [];
  const sameDni: string[] = [];
  const badDni: string[] = [];
  for (const raw of table.slice(headerIdx + 1)) {
    const dni = cleanDni(at(raw, "dni"));
    const phone = at(raw, "phone");
    const email = at(raw, "email").toLowerCase();
    // Nombre: «APELLIDOS, NOMBRE» en una columna, o nombre de pila y apellidos por separado (A3)
    const first = at(raw, "first");
    const name = (first ? [first, at(raw, "surname"), at(raw, "surname2")] : [at(raw, "name"), at(raw, "surname"), at(raw, "surname2")]).filter(Boolean).join(" ");
    const parts = first ? a3Parts(first, at(raw, "surname"), at(raw, "surname2")) : null;
    const code = at(raw, "code");
    if (!dni && !phone && !email && !name && !code) continue;
    rows++;
    if (/^\d+$/.test(code)) maxCode = Math.max(maxCode, Number(code));
    const key = phone ? phoneKey(phone) : "";
    const w =
      // Primero el código de A3 (es único por alta); si no, el DNI
      (/^\d+$/.test(code) && byCode.get(codeKey(code))) ||
      (dni && byDni.get(dni)) ||
      (key.length >= 9 && byPhone.get(key)) ||
      (email && byEmail.get(email)) ||
      (name ? byName.get(nameKey(name)) : null);
    if (!w) {
      // No está en la app: se da de alta. Se identifica por su DNI o su código de A3, para no duplicarla en la siguiente importación.
      if (!opts.create || !name) continue;
      const n = parts ?? a3Name(name);
      if (dni && !validDniNie(dni)) {
        cannot.push(`${n.name}: DNI no válido (${dni})`);
        continue;
      }
      if (!dni && !/^\d+$/.test(code)) {
        cannot.push(`${n.name}: sin DNI ni código de A3`);
        continue;
      }
      const id = dni || `A3:${codeKey(code)}`;
      if (seen.has(id)) {
        // A3 da un código nuevo a quien vuelve a trabajar: es la misma persona, no se duplica
        if (dni) sameDni.push(`${n.name} (${dni})${code ? `: código ${code}` : ""}`);
        else cannot.push(`${n.name}: código de A3 repetido en el archivo (${code})`);
        continue;
      }
      seen.add(id);
      const okPhone = key.length >= 9 && !phoneOwners.has(key);
      const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (okPhone) phoneOwners.add(key);
      const role = parseRole(at(raw, "role")) ?? opts.defaultRole ?? "CAMARERO";
      const sex = norm(at(raw, "sex"));
      const iban = at(raw, "iban").toUpperCase().replace(/\s/g, "");
      const nss = at(raw, "nss").replace(/\D/g, "");
      const rates: Record<string, number> = {};
      for (const t of ["BODA", "EVENTO", "OTRO"] as const) {
        const r = rateValue(at(raw, `rate${t}` as Col)) ?? rateValue(at(raw, "rateAll"));
        const m = rateValue(at(raw, `rateMAITRE:${t}` as Col)) ?? rateValue(at(raw, "rateMAITRE:ALL"));
        if (r != null) rates[t] = r;
        if (m != null) rates[`MAITRE:${t}`] = m;
      }
      if (!opts.dryRun)
        await db.worker.create({
          data: {
            name: n.name,
            ...(n.firstName && { firstName: n.firstName, surname1: n.surname1, surname2: n.surname2 }),
            ...(dni && { dni }),
            role,
            roles: [role],
            accessCode: newAccessCode(),
            ...(okPhone && { phone, phoneKey: key }),
            ...(okEmail && { email }),
            ...(code && { a3Code: code }),
            ...(nss.length >= 11 && { nss }),
            ...(at(raw, "center") && { a3Center: at(raw, "center") }),
            ...(iban && validIban(iban) && { iban }),
            ...(parseDate(at(raw, "birth")) && { birthDate: parseDate(at(raw, "birth")) }),
            ...(at(raw, "address") && { address: at(raw, "address") }),
            ...(/^(h|hombre|varon|m|masculino)$/.test(sex) ? { sex: "Hombre" } : /^(mujer|f|femenino)$/.test(sex) ? { sex: "Mujer" } : {}),
            ...(at(raw, "nationality") && { nationality: at(raw, "nationality").toLocaleUpperCase("es-ES") }),
            ...(at(raw, "zone") && { zone: at(raw, "zone") }),
            ...(parseContract(at(raw, "contract")) && { contractCode: parseContract(at(raw, "contract")) }),
            ...(Object.keys(rates).length && { customRates: rates }),
          },
        });
      created.push(n.name);
      if (!dni) noDni.push(n.name);
      continue;
    }
    if (matched.has(w.id)) continue;
    matched.add(w.id);

    const data: Record<string, unknown> = {};
    const put = (field: keyof typeof w, value: string | null | undefined) => {
      if (value && !w[field]) data[field] = value;
    };
    if (code && !w.a3Code) data.a3Code = code;
    else if (code && w.a3Code && w.a3Code.replace(/^0+/, "") !== code.replace(/^0+/, "")) conflicts.push(`${w.name}: código en la app ${w.a3Code}, en el archivo ${code}`);
    if (dni && !validDniNie(dni)) badDni.push(`${w.name}: ${dni}`);
    else if (dni && !w.dni) {
      // Ese DNI ya lo tiene otra ficha: es la misma persona con dos códigos de A3 (se avisa para unirlas)
      const other = byDni.get(dni);
      if (other && other.id !== w.id) sameDni.push(`${w.name} (${dni}): también es ${other.name}`);
      put("dni", dni);
      byDni.set(dni, w);
    }
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
    put("contractCode", parseContract(at(raw, "contract")));
    // Tarifa propia por tipo de evento: se rellena la que falte (o se sustituye si se pide)
    const current = (w.customRates ?? {}) as Record<string, number>;
    const rates = { ...current };
    let ratesChanged = false;
    for (const t of ["BODA", "EVENTO", "OTRO"] as const) {
      for (const [k, v] of [
        [t, rateValue(at(raw, `rate${t}` as Col)) ?? rateValue(at(raw, "rateAll"))],
        [`MAITRE:${t}`, rateValue(at(raw, `rateMAITRE:${t}` as Col)) ?? rateValue(at(raw, "rateMAITRE:ALL"))],
      ] as const) {
        if (v != null && (opts.replaceRates || current[k] == null) && current[k] !== v) {
          rates[k] = v;
          ratesChanged = true;
        }
      }
    }
    if (ratesChanged) data.customRates = rates;
    if (parts && !w.firstName && !w.surname1) Object.assign(data, { firstName: parts.firstName, surname1: parts.surname1, surname2: parts.surname2 });
    else if (name.includes(",") && !w.firstName && !w.surname1) {
      const [surnames, first] = name.split(",").map((s) => s.trim());
      const [s1, ...rest] = surnames.split(/\s+/);
      if (first && s1) Object.assign(data, { firstName: first, surname1: s1, surname2: rest.join(" ") || "" });
    }
    if (Object.keys(data).length) {
      if (!opts.dryRun) await db.worker.update({ where: { id: w.id }, data });
      updated.push(w.name);
      for (const k of Object.keys(data)) if (FIELD_LABEL[k]) filled[FIELD_LABEL[k]] = (filled[FIELD_LABEL[k]] ?? 0) + 1;
    }
  }
  if (!rows) return { ok: false, message: "El archivo no tiene filas con datos." };
  const what = Object.entries(filled).map(([k, n]) => `${n} ${k}`).join(", ");
  if (opts.create) {
    const list = (title: string, names: string[]) => (names.length ? [`${title}:`, ...names.slice(0, 40).map((x) => `  ${x}`), ...(names.length > 40 ? [`  … y ${names.length - 40} más`] : [])] : []);
    const details = [
      ...list(opts.dryRun ? "Se darán de alta" : "Dados de alta", created),
      ...list("No se pueden dar de alta", cannot),
      ...list("Mismo DNI con otro código de A3 (es la misma persona: si tiene dos fichas, únelas en Personal → personas repetidas)", sameDni),
      ...list("DNI no válido en A3 (no se ha guardado: corrígelo en A3 o en su ficha)", badDni),
      ...list("Sin DNI: para entrar en la app necesitan su DNI (impórtalo desde A3 con un listado que lo incluya, o ponlo en su ficha)", noDni),
      ...(conflicts.length ? list("Con un código de A3 distinto en la app (no se cambia)", conflicts) : []),
    ];
    const summary =
      `${rows} personas en el archivo: ${created.length} ${opts.dryRun ? "nuevas se darán de alta" : "dadas de alta"}, ` +
      `${matched.size} ya estaban en la app (${updated.length} ${opts.dryRun ? "se completarán" : "completadas"}${what ? `: ${what}` : ""})` +
      `${cannot.length ? `, ${cannot.length} no se pueden dar de alta` : ""}.`;
    if (opts.dryRun) return { ok: true, preview: true, message: `Vista previa (aún no se ha guardado nada). ${summary}`, details };
    if (maxCode) await bumpLastCode(maxCode);
    await auditAdmin(by, "Trabajador", "Importación A3", summary);
    const next = maxCode ? ` El próximo código de alta en A3 será el ${(await getA3Alta()).lastCode + 1}.` : "";
    return { ok: true, message: `Hecho. ${summary}${next}${created.length ? " Ya puedes mandarles las instrucciones de acceso desde «Pedir avisos» o desde su ficha." : ""}`, details };
  }
  if (maxCode) await bumpLastCode(maxCode);
  await auditAdmin(by, "Trabajador", "Completar datos", `${rows} filas: ${matched.size} encontrados en la app, ${updated.length} fichas completadas${conflicts.length ? `, ${conflicts.length} códigos distintos` : ""}`);
  const stillMissing = (await incompleteWorkers()).length;
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
