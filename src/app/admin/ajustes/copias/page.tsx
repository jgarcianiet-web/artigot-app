import Link from "next/link";
import { backupStatus, listBackups } from "@/lib/backup";
import { db } from "@/lib/db";
import { encryptionEnabled, storageEnabled } from "@/lib/storage";
import { BackupButton, MigrateButton } from "./Buttons";

const when = (d: Date | string) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function Backups() {
  const storage = storageEnabled();
  const [inDb, inStore, status, backups] = await Promise.all([
    db.storedFile.count({ where: { storageKey: null } }),
    db.storedFile.count({ where: { storageKey: { not: null } } }),
    backupStatus(),
    listBackups().catch(() => []),
  ]);
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Copias de seguridad y archivos</h1>
        <p className="text-sm text-stone-500">Los documentos, fotos y firmas se guardan en un almacén de archivos aparte y cada noche se hace una copia de toda la base de datos.</p>
      </div>

      <section className={`card space-y-2 ${storage ? "" : "border-amber-300 bg-amber-50"}`}>
        <h2>Almacén de archivos</h2>
        {storage ? (
          <p className="text-sm">✓ Configurado{encryptionEnabled() ? " y con cifrado" : <span className="text-amber-800"> · sin cifrado: añade FILES_ENCRYPTION_KEY</span>}. {inStore} archivos en el almacén{inDb ? `, ${inDb} aún en la base de datos (se mueven solos esta noche)` : ""}.</p>
        ) : (
          <div className="space-y-1 text-sm text-amber-900">
            <p><b>Sin configurar.</b> Los {inDb} archivos están dentro de la base de datos y no se hacen copias automáticas.</p>
            <p>Para activarlo, añade en las variables de Railway: <code>S3_BUCKET</code>, <code>S3_ACCESS_KEY_ID</code>, <code>S3_SECRET_ACCESS_KEY</code>, <code>S3_ENDPOINT</code> y <code>FILES_ENCRYPTION_KEY</code> (ver README).</p>
          </div>
        )}
        {storage && <MigrateButton remaining={inDb} />}
      </section>

      <section className="card space-y-3">
        <h2>Copias de seguridad</h2>
        <p className="text-sm text-stone-600">
          {status.lastAt ? <>Última copia: <b>{when(status.lastAt)}</b>{status.lastSize ? ` (${kb(status.lastSize)})` : ""}.</> : "Aún no se ha hecho ninguna copia."}
          {" "}Se hace sola cada noche a las 3:00 y se guardan las de los últimos 30 días y una por mes durante un año.
        </p>
        {status.lastError && status.lastErrorAt && (!status.lastAt || status.lastErrorAt > status.lastAt) && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-800">⚠️ La última copia falló ({when(status.lastErrorAt)}): {status.lastError}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {storage && <BackupButton />}
          <a href="/admin/ajustes/copias/descargar?ahora=1" className="btn">Descargar una copia ahora</a>
        </div>
        <p className="text-xs text-stone-500">La descarga contiene datos personales de toda la plantilla: guárdala en un sitio seguro.</p>
        {backups.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead><tr><th>Copia</th><th className="text-right">Tamaño</th><th /></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.key}>
                    <td>{b.modified ? when(b.modified) : b.key}</td>
                    <td className="text-right">{kb(b.size)}</td>
                    <td className="text-right"><a href={`/admin/ajustes/copias/descargar?key=${encodeURIComponent(b.key)}`} className="link">Descargar</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
