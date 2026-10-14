import ExcelJS from "exceljs";
import { isRole, type Role } from "./domain";

/** Lectura de Excel (.xlsx) y CSV como tabla de texto, y utilidades comunes de las importaciones. */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function parseRole(value: string): Role | null {
  const v = norm(value);
  if (!v) return null;
  if (isRole(v.toUpperCase())) return v.toUpperCase() as Role;
  if (/(camarer[oa]s? responsable|responsable de (servicio|evento|equipo)|^responsable$|jefe de rango)/.test(v)) return "RESPONSABLE";
  if (/(maitre|metre|jefe de sala|responsable de sala|encargad)/.test(v)) return "MAITRE";
  if (/(mozo|descarga|carga|montaje|mozo de almacen|peon)/.test(v)) return "MOZO";
  if (/(camarer|waiter|servicio|extra)/.test(v)) return "CAMARERO";
  return null;
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

/** Lee un .xlsx o .csv como tabla de texto (o devuelve el error para mostrar). */
export async function readTable(file: File): Promise<string[][] | { error: string }> {
  if (!file || file.size === 0) return { error: "Selecciona un archivo." };
  if (file.size > MAX_FILE_BYTES) return { error: "El archivo es demasiado grande (máximo 5 MB)." };
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  try {
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return await readXlsx(buffer);
    if (name.endsWith(".csv") || name.endsWith(".txt")) return readCsv(buffer);
  } catch {
    return { error: "No se ha podido leer el archivo. Comprueba que es un Excel (.xlsx) o CSV válido." };
  }
  if (/\.(xls|ods|numbers)$/.test(name)) return { error: "Ese formato no se puede leer. Ábrelo en Excel y guárdalo como «Libro de Excel (.xlsx)» o CSV." };
  return { error: "Sube un archivo .xlsx o .csv." };
}
