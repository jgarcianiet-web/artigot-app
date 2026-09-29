import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addUnavailability,
  deleteWorker,
  regenerateToken,
  removeUnavailability,
  toggleWorkerActive,
} from "@/app/actions";
import { ConfirmButton, CopyButton, SubmitButton } from "@/components/client";
import { Empty, RoleBadge, Stars, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { appUrl, formatDate, num, today, whatsappLink, workedHours } from "@/lib/domain";

export default async function WorkerDetail({ params }: { params: Promise<{ id: string }> }) {
  const t = today();
  const worker = await db.worker.findUnique({
    where: { id: (await params).id },
    include: {
      unavailabilities: { where: { date: { gte: t } }, orderBy: { date: "asc" } },
      assignments: { include: { event: true }, orderBy: { event: { date: "desc" } }, take: 50 },
    },
  });
  if (!worker) notFound();

  const portal = `${appUrl()}/p/${worker.token}`;
  const welcome = `Hola ${worker.name.split(" ")[0]}, este es tu enlace personal para ver tus convocatorias, confirmar servicios, fichar y marcar los días que no puedes trabajar: ${portal}`;

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

      <section className="card space-y-2">
        <h2>Enlace personal del trabajador</h2>
        <p className="text-sm text-stone-500">
          Con este enlace el trabajador confirma convocatorias, ficha entrada y salida y marca sus días no disponibles. No necesita contraseña: no lo compartas con otras personas.
        </p>
        <code className="block overflow-x-auto rounded bg-stone-100 px-2 py-1 text-xs">{portal}</code>
        <div className="flex flex-wrap gap-2">
          <a href={whatsappLink(worker.phone, welcome)} target="_blank" className="btn btn-sm btn-success">Enviar por WhatsApp</a>
          <CopyButton text={portal} label="Copiar enlace" />
          <form action={regenerateToken.bind(null, worker.id)}>
            <ConfirmButton className="btn btn-sm" message="El enlace actual dejará de funcionar. ¿Continuar?">Generar enlace nuevo</ConfirmButton>
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
