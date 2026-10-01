/**
 * Restaura una copia de seguridad. BORRA los datos actuales.
 *   npx tsx scripts/restore.ts --latest --yes            (la última del almacén)
 *   npx tsx scripts/restore.ts backups/artigot-….json.gz --yes   (una concreta del almacén)
 *   npx tsx scripts/restore.ts ./copia.json.gz --yes     (un archivo descargado)
 * Necesita DATABASE_URL y, para el almacén o copias cifradas, las variables S3_* y FILES_ENCRYPTION_KEY.
 */
import { existsSync, readFileSync } from "node:fs";
import { listBackups, restoreDatabase, unpackBackup } from "../src/lib/backup";
import { db } from "../src/lib/db";
import { getRawObject } from "../src/lib/storage";

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  if (!args.includes("--yes") || (!target && !args.includes("--latest"))) {
    console.log("Uso: npx tsx scripts/restore.ts (--latest | <archivo o clave>) --yes\nATENCIÓN: borra los datos actuales.");
    process.exit(1);
  }
  let raw: Buffer;
  if (args.includes("--latest")) {
    const last = (await listBackups())[0];
    if (!last) throw new Error("No hay copias en el almacén.");
    console.log("Restaurando", last.key);
    raw = await getRawObject(last.key);
  } else if (existsSync(target!)) raw = readFileSync(target!);
  else raw = await getRawObject(target!);
  const data = unpackBackup(raw);
  console.log(`Copia del ${data.createdAt}`);
  const counts = await restoreDatabase(data);
  console.table(counts);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
