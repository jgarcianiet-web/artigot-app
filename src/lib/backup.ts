import { gunzipSync, gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { decrypt, deleteObject, listObjects, putObject, storageEnabled } from "./storage";

/**
 * Copias de seguridad de la base de datos: exportación completa (todas las tablas), comprimida y
 * cifrada, guardada en el almacén de archivos. Se hace cada noche y se conservan las 30 últimas
 * diarias y una por mes durante 12 meses. Los documentos ya están en el almacén y no se duplican.
 */

const MODELS = Prisma.dmmf.datamodel.models;
type Model = (typeof MODELS)[number];
const delegate = (m: Model) => (db as unknown as Record<string, { findMany: (a: object) => Promise<Record<string, unknown>[]>; createMany: (a: object) => Promise<unknown>; update: (a: object) => Promise<unknown> }>)[m.name[0].toLowerCase() + m.name.slice(1)];

/** Relaciones con clave en la propia tabla (las que apuntan a otra tabla con sus campos). */
const ownRelations = (m: Model) => m.fields.filter((f) => f.kind === "object" && f.relationFromFields?.length);
/** Una relación es obligatoria si alguno de sus campos lo es. */
const requiredRelation = (m: Model, f: Model["fields"][number]) => f.relationFromFields!.some((k) => m.fields.find((x) => x.name === k)?.isRequired);

/**
 * Orden en que hay que insertar las tablas: solo cuentan las relaciones obligatorias. Las
 * opcionales que apunten a una tabla aún no cargada (o a la propia) se dejan vacías al insertar y
 * se rellenan al final; así se resuelven los ciclos (p. ej. trabajador ↔ foto de perfil).
 */
function insertOrder() {
  const deps = new Map(MODELS.map((m) => [m.name, new Set(ownRelations(m).filter((f) => f.type !== m.name && requiredRelation(m, f)).map((f) => f.type))]));
  const out: Model[] = [];
  const done = new Set<string>();
  while (out.length < MODELS.length) {
    const next = MODELS.find((m) => !done.has(m.name) && [...deps.get(m.name)!].every((d) => done.has(d)));
    if (!next) throw new Error("Relaciones circulares entre tablas");
    out.push(next);
    done.add(next.name);
  }
  return out;
}

const idField = (m: Model) => m.fields.find((f) => f.isId)?.name ?? m.primaryKey?.fields[0] ?? m.fields[0].name;

export type BackupData = { app: "artigot"; version: 1; createdAt: string; tables: Record<string, Record<string, unknown>[]> };

/** Exporta todas las tablas (los Bytes en base64; fechas en ISO). */
export async function exportDatabase(): Promise<BackupData> {
  const tables: BackupData["tables"] = {};
  for (const m of MODELS) {
    const id = idField(m);
    const rows: Record<string, unknown>[] = [];
    let cursor: unknown;
    for (;;) {
      const page = await delegate(m).findMany({ take: 1000, orderBy: { [id]: "asc" }, ...(cursor !== undefined && { cursor: { [id]: cursor }, skip: 1 }) });
      for (const r of page) {
        for (const f of m.fields) if (f.type === "Bytes" && r[f.name]) r[f.name] = Buffer.from(r[f.name] as Uint8Array).toString("base64");
        rows.push(r);
      }
      if (page.length < 1000) break;
      cursor = page.at(-1)![id];
    }
    tables[m.name] = rows;
  }
  return { app: "artigot", version: 1, createdAt: new Date().toISOString(), tables };
}

export const packBackup = (data: BackupData) => gzipSync(Buffer.from(JSON.stringify(data)));

/** Lee una copia (cifrada o no, comprimida o no). */
export function unpackBackup(raw: Buffer): BackupData {
  let b = decrypt(raw);
  if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
  const data = JSON.parse(b.toString("utf8")) as BackupData;
  if (data.app !== "artigot" || !data.tables) throw new Error("No es una copia de seguridad de Artigot.");
  return data;
}

/** Restaura una copia: BORRA todos los datos actuales y carga los de la copia. */
export async function restoreDatabase(data: BackupData) {
  const order = insertOrder();
  const names = MODELS.map((m) => `"${m.name}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${names} CASCADE`);
  const counts: Record<string, number> = {};
  const loaded = new Set<string>();
  const pending: { model: Model; rows: Record<string, unknown>[]; fields: string[] }[] = [];
  for (const m of order) {
    const rows = data.tables[m.name] ?? [];
    // Claves opcionales a tablas aún no cargadas (o a la propia): se rellenan al final
    const deferred = ownRelations(m).filter((f) => f.type === m.name || !loaded.has(f.type)).flatMap((f) => f.relationFromFields!);
    const prepared = rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const f of m.fields) {
        if (f.kind === "object" || !(f.name in r)) continue;
        let v = r[f.name];
        if (v !== null && f.type === "DateTime") v = new Date(v as string);
        if (v !== null && f.type === "Bytes") v = Buffer.from(v as string, "base64");
        if (f.type === "Json" && v === null) v = Prisma.DbNull;
        if (deferred.includes(f.name)) v = null;
        o[f.name] = v;
      }
      return o;
    });
    for (let i = 0; i < prepared.length; i += 500) await delegate(m).createMany({ data: prepared.slice(i, i + 500) });
    if (deferred.length) pending.push({ model: m, rows, fields: deferred });
    loaded.add(m.name);
    counts[m.name] = rows.length;
  }
  for (const { model, rows, fields } of pending) {
    const id = idField(model);
    for (const r of rows) {
      const fix = Object.fromEntries(fields.filter((k) => r[k] != null).map((k) => [k, r[k]]));
      if (Object.keys(fix).length) await delegate(model).update({ where: { [id]: r[id] }, data: fix });
    }
  }
  return counts;
}

// ---------- Copias en el almacén ----------

export const BACKUP_PREFIX = "backups/";

type Status = { lastAt?: string; lastKey?: string; lastSize?: number; lastError?: string | null; lastErrorAt?: string };

export async function backupStatus(): Promise<Status> {
  return ((await db.setting.findUnique({ where: { key: "copias" } }))?.value ?? {}) as Status;
}

async function saveStatus(s: Status) {
  const value = { ...(await backupStatus()), ...s };
  await db.setting.upsert({ where: { key: "copias" }, create: { key: "copias", value }, update: { value } });
}

/** Hace una copia y la guarda en el almacén. */
export async function backupNow() {
  if (!storageEnabled()) throw new Error("Configura el almacén de archivos para guardar copias automáticas.");
  try {
    const body = packBackup(await exportDatabase());
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const key = `${BACKUP_PREFIX}artigot-${stamp}.json.gz`;
    await putObject(key, body, "application/gzip");
    await saveStatus({ lastAt: new Date().toISOString(), lastKey: key, lastSize: body.length, lastError: null });
    await pruneBackups();
    return { key, size: body.length };
  } catch (e) {
    await saveStatus({ lastError: (e as Error).message, lastErrorAt: new Date().toISOString() });
    throw e;
  }
}

export async function listBackups() {
  if (!storageEnabled()) return [];
  return (await listObjects(BACKUP_PREFIX)).sort((a, b) => b.key.localeCompare(a.key));
}

/** Conserva las 30 copias más recientes (una por día) y la primera de cada mes durante 12 meses. */
export async function pruneBackups() {
  const all = await listBackups();
  const day = (k: string) => k.slice(BACKUP_PREFIX.length + "artigot-".length, BACKUP_PREFIX.length + "artigot-".length + 10);
  const keep = new Set<string>();
  const days = new Set<string>();
  for (const b of all) {
    if (days.size >= 30) break;
    if (!days.has(day(b.key))) {
      days.add(day(b.key));
      keep.add(b.key);
    }
  }
  const months = new Map<string, string>();
  for (const b of [...all].reverse()) if (!months.has(day(b.key).slice(0, 7))) months.set(day(b.key).slice(0, 7), b.key);
  [...months.entries()].sort().reverse().slice(0, 12).forEach(([, k]) => keep.add(k));
  const drop = all.filter((b) => !keep.has(b.key));
  for (const b of drop) await deleteObject(b.key);
  return drop.length;
}
