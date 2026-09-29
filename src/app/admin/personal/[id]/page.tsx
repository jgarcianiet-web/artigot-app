import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addUnavailability,
  deleteWorker,
  regenerateAccessCode,
  removeUnavailability,
  toggleWorkerActive,
} from "@/app/actions";
import { ConfirmButton, CopyButton, SubmitButton } from "@/components/client";
import { Empty, RoleBadge, Stars, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { appUrl, formatDate, num, today, workedHours } from "@/lib/domain";

const DEVICE_LABEL: Record<string, string> = { web: "Navegador / web app", fcm: "App Android", apns: "App iPhone" };

export default async function WorkerDetail({ params }: { params: Promise<{ id: string }> }) {
  const t = today();
  const worker = await db.worker.findUnique({
    where: { id: (await params).id },
    include: {
      unavailabilities: { where: { date: { gte: t } }, orderBy: { date: "asc" } },
      assignments: { include: { event: true }, orderBy: { event: { date: "desc" } }, take: 50 },
      devices: { select: { kind: true } },
    },
  });
  if (!worker) notFound();

  const instructions = [
    `Hola ${worker.name.split(" ")[0]}, ya tienes acceso a la app de Artigot para ver convocatorias, confirmar, fichar y hablar en el chat de cada evento.`,
    `Entra en ${appUrl()} (o en la app) con:`,
    `Teléfono: ${worker.phone}`,
    `Código: ${worker.accessCode}`,
    process.env.ANDROID_APK_URL && `App Android: ${process.env.ANDROID_APK_URL}`,
    process.env.IOS_APP_URL && `App iPhone: ${process.env.IOS_APP_URL}`,
  ]
    .filter(Boolean)
    .join("\n");
  const deviceKinds = [...new Set(worker.devices.map((d) => DEVICE_LABEL[d.kind] ?? d.kind))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{worker.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <RoleBadge role={worker.role} />
            <Stars value={worker.rating} />
            <a href={`tel:${worker.phone}`}>{worker.phone}</a>
            {worker.email && <span>· {worker.email}</span>}
            {worker.zone && <span>· {worker.zone}</span>}
            {!worker.active && <span className="font-medium text-red-600">· Inactivo</span>}
          </div>
          {worker.notes && <p className="mt-2 max-w-xl text-sm whitespace-pre-line text-stone-600">{worker.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/personal/${worker.id}/editar`} className="btn">Editar</Link>
          <form action={toggleWorkerActive.bind(null, worker.id)}>
            <SubmitButton className="btn">{worker.active ? "Dar de baja" : "Reactivar"}</SubmitButton>
          </form>
          <form action={deleteWorker.bind(null, worker.id)}>
            <ConfirmButton message="¿Eliminar definitivamente este trabajador y todo su historial?">Eliminar</ConfirmButton>
          </form>
        </div>
      </div>

      <section className="card space-y-3">
        <h2>Acceso a la app</h2>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs text-stone-500">Teléfono</div>
            <div className="font-medium">{worker.phone}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Código de acceso</div>
            <div className="font-mono text-2xl tracking-[0.3em]">{worker.accessCode}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Avisos activos en</div>
            <div className="text-sm">{deviceKinds.length ? deviceKinds.join(", ") : <span className="text-amber-700">ningún dispositivo todavía</span>}</div>
          </div>
        </div>
        {worker.lockedUntil && worker.lockedUntil > new Date() && (
          <p className="text-sm text-red-600">Bloqueado por intentos fallidos. Genera un código nuevo para desbloquearlo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <CopyButton text={instructions} label="Copiar instrucciones de acceso" />
          <form action={regenerateAccessCode.bind(null, worker.id)}>
            <ConfirmButton className="btn btn-sm" message="Se cerrará su sesión en todos sus dispositivos y tendrá que entrar con el código nuevo. ¿Continuar?">
              Generar código nuevo
            </ConfirmButton>
          </form>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className="card space-y-3">
          <h2>Días no disponibles</h2>
          <form action={addUnavailability.bind(null, worker.id)} className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Desde</label>
              <input type="date" name="from" min={t} className="input" required />
            </div>
            <div>
              <label className="label">Hasta (opcional)</label>
              <input type="date" name="to" min={t} className="input" />
            </div>
            <input name="reason" placeholder="Motivo (opcional)" className="input col-span-2" />
            <SubmitButton className="btn col-span-2">Añadir</SubmitButton>
          </form>
          {worker.unavailabilities.length === 0 ? (
            <p className="text-sm text-stone-500">Disponible todos los días próximos.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {worker.unavailabilities.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-1.5">
                  <span>
                    {formatDate(u.date)} {u.reason && <span className="text-stone-500">· {u.reason}</span>}
                  </span>
                  <form action={removeUnavailability.bind(null, u.id)}>
                    <button className="text-xs text-red-600 hover:underline">Quitar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3">
          <h2>Historial de servicios</h2>
          {worker.assignments.length === 0 ? (
            <Empty>Todavía no ha sido convocado a ningún evento.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Evento</th>
                    <th>Estado</th>
                    <th className="text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {worker.assignments.map((a) => {
                    const h = workedHours(a);
                    return (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap">{formatDate(a.event.date)}</td>
                        <td><Link href={`/admin/eventos/${a.eventId}`} className="link">{a.event.name}</Link></td>
                        <td><StatusBadge status={a.status} /></td>
                        <td className="text-right">{h != null ? num(h) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
