import ExcelJS from "exceljs";
import { phoneKey } from "./auth";
import { db } from "./db";
import { isRole, type Role } from "./domain";

/**
 * Importación del personal desde Excel (.xlsx) o CSV.
 * Detecta las columnas por su nombre (admite variantes habituales), normaliza puestos
 * y teléfonos y marca cada fila como nueva, a actualizar, ya existente o con error.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 3000;

type Field = "name" | "surname" | "phone" | "role" | "email" | "zone" | "rating" | "notes";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ALIASES: Record<Field, string[]> = {
  name: ["nombre", "nombre y apellidos", "nombre completo", "nombre apellidos", "trabajador", "empleado", "persona", "name"],
  surname: ["apellidos", "apellido", "primer apellido", "apellido 1", "apellidos 1"],
  phone: ["telefono", "tel", "tlf", "telf", "movil", "telefono movil", "movil personal", "celular", "whatsapp", "phone", "contacto"],
  role: ["puesto", "categoria", "rol", "cargo", "funcion", "perfil", "tipo", "puesto de trabajo"],
  email: ["email", "e mail", "correo", "correo electronico", "mail"],
  zone: ["zona", "localidad", "poblacion", "ciudad", "municipio", "residencia", "provincia", "direccion"],
  rating: ["valoracion", "puntuacion", "nota", "estrellas", "rating", "nivel"],
  notes: ["notas", "observaciones", "comentarios", "obs"],
};

function fieldFor(header: string): Field | null {
  const h = norm(header);
  if (!h) return null;
  for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
    if (aliases.includes(h)) return field;
  }
  // Coincidencias parciales para cabeceras largas («Teléfono móvil personal», «Correo de contacto»…)
  if (/\b(telefono|movil|tlf|telf)\b/.test(h)) return "phone";
  if (/\b(correo|email|mail)\b/.test(h)) return "email";
  if (/\bapellido/.test(h)) return "surname";
  if (/\bnombre\b/.test(h)) return "name";
  if (/\b(puesto|categoria)\b/.test(h)) return "role";
  return null;
}

export function parseRole(value: string): Role | null {
  const v = norm(value);
  if (!v) return null;
  if (isRole(v.toUpperCase())) return v.toUpperCase() as Role;
  if (/(maitre|metre|jefe de sala|jefe de rango|responsable de sala|encargad)/.test(v)) return "MAITRE";
  if (/(mozo|descarga|carga|montaje|mozo de almacen|peon)/.test(v)) return "MOZO";
  if (/(camarer|waiter|servicio|extra)/.test(v)) return "CAMARERO";
  return null;
}

function parseRating(value: string): number | null {
  const stars = (value.match(/★/g) ?? []).length;
  if (stars) return Math.min(5, stars);
  const n = Number(value.replace(",", "."));
  if (!value.trim() || !Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n > 5 ? n / 2 : n))); // admite notas sobre 10
}

// ---------- Lectura del archivo ----------

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
  }
  return String(v);
}

async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  // La primera hoja con datos
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as ExcelJS.CellValue[]; // índice 0 vacío
    rows.push(values.slice(1).map((v) => cellText(v).trim()));
  });
  return rows;
}

function readCsv(buffer: ArrayBuffer): string[][] {
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buffer); // CSV guardado por Excel en Windows
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", ",", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

// ---------- Análisis ----------

export type ImportRow = {
  line: number;
  name: string;
  phone: string;
  role: Role | null;
  roleRaw: string;
  email: string | null;
  zone: string | null;
  rating: number | null;
  notes: string | null;
  status: "nuevo" | "actualizar" | "existe" | "error";
  message?: string;
  existingName?: string;
};

export type ImportPreview = {
  rows: ImportRow[];
  columns: { header: string; field: Field | null }[];
  counts: Record<ImportRow["status"], number>;
};

export async function analyzeFile(
  file: File,
  opts: { defaultRole: Role | null; updateExisting: boolean },
): Promise<ImportPreview | { error: string }> {
  if (!file || file.size === 0) return { error: "Selecciona un archivo." };
  if (file.size > MAX_FILE_BYTES) return { error: "El archivo es demasiado grande (máximo 5 MB)." };
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  let table: string[][];
  try {
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) table = await readXlsx(buffer);
    else if (name.endsWith(".csv") || name.endsWith(".txt")) table = readCsv(buffer);
    else if (name.endsWith(".xls") || name.endsWith(".ods") || name.endsWith(".numbers")) {
      return { error: "Ese formato no se puede leer. Ábrelo en Excel y guárdalo como «Libro de Excel (.xlsx)» o CSV." };
    } else return { error: "Sube un archivo .xlsx o .csv." };
  } catch {
    return { error: "No se ha podido leer el archivo. Comprueba que es un Excel (.xlsx) o CSV válido." };
  }

  // Cabecera: la primera de las 10 primeras filas donde se reconozca el teléfono y el nombre
  let headerIdx = -1;
  let fields: (Field | null)[] = [];
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const f = table[i].map(fieldFor);
    if (f.includes("phone") && (f.includes("name") || f.includes("surname"))) {
      headerIdx = i;
      fields = f;
      break;
    }
  }
  if (headerIdx < 0) {
    return { error: "No encuentro las columnas de nombre y teléfono. La primera fila debe tener cabeceras como «Nombre», «Teléfono» y «Puesto» (descarga la plantilla)." };
  }
  const columns = table[headerIdx].map((header, i) => ({ header, field: fields[i] }));
  const col = (row: string[], field: Field) =>
    fields.map((f, i) => (f === field ? row[i] ?? "" : "")).filter(Boolean).join(" ").trim();

  const body = table.slice(headerIdx + 1);
  if (body.length > MAX_ROWS) return { error: `El archivo tiene demasiadas filas (máximo ${MAX_ROWS}).` };

  const existing = await db.worker.findMany({ select: { id: true, name: true, phoneKey: true } });
  const byPhone = new Map(existing.map((w) => [w.phoneKey, w]));
  const seen = new Map<string, number>();
  const rows: ImportRow[] = [];

  body.forEach((raw, i) => {
    if (raw.every((c) => !c)) return; // fila vacía
    const line = headerIdx + i + 2; // número de fila tal y como se ve en Excel
    const name = [col(raw, "name"), col(raw, "surname")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const phone = col(raw, "phone");
    const roleRaw = col(raw, "role");
    const email = col(raw, "email") || null;
    const row: ImportRow = {
      line,
      name,
      phone,
      role: parseRole(roleRaw) ?? (roleRaw ? null : opts.defaultRole),
      roleRaw,
      email,
      zone: col(raw, "zone") || null,
      rating: parseRating(col(raw, "rating")),
      notes: col(raw, "notes") || null,
      status: "nuevo",
    };
    const key = phoneKey(phone);
    const fail = (message: string) => rows.push({ ...row, status: "error", message });
    if (name.length < 2) return fail("Falta el nombre");
    if (key.length < 9) return fail(phone ? "Teléfono no válido (menos de 9 cifras)" : "Falta el teléfono");
    const match = byPhone.get(key);
    if (roleRaw && !parseRole(roleRaw)) return fail(`Puesto no reconocido: «${roleRaw}» (usa Camarero, Maître o Mozo)`);
    // A quien ya existe se le mantiene su puesto si el Excel no lo indica
    if (!row.role && !match) return fail("Falta el puesto (elige un puesto por defecto)");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Email no válido");
    if (seen.has(key)) return fail(`Teléfono repetido (ya está en la fila ${seen.get(key)})`);
    seen.set(key, line);
    if (match) {
      rows.push({ ...row, status: opts.updateExisting ? "actualizar" : "existe", existingName: match.name });
    } else rows.push(row);
  });

  const counts = { nuevo: 0, actualizar: 0, existe: 0, error: 0 };
  rows.forEach((r) => counts[r.status]++);
  return { rows, columns, counts };
}
