import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { db } from "@/lib/db";
import { formatDate, ROLE_LABEL, workerRoles, type Role } from "@/lib/domain";
import { closePoll, deletePoll, remindPoll } from "../actions";

export default async function PollDetail({ params }: { params: Promise<{ id: string }> }) {
  const poll = await db.availabilityPoll.findUnique({
    where: { id: (await params).id },
    include: { answers: { include: { worker: { select: { id: true, name: true, zone: true } } } } },
  });
  if (!poll) notFound();
  const [workers, events] = await Promise.all([
    db.worker.findMany({ where: { active: true }, select: { id: true, name: true, role: true, roles: true } }),
    db.event.findMany({ where: { date: { in: poll.dates } }, select: { id: true, name: true, date: true }, orderBy: { startTime: "asc" } }),
  ]);
  const target = workers.filter((w) => !poll.roles.length || workerRoles(w).some((r) => poll.roles.includes(r)));
  const answered = new Set(poll.answers.map((a) => a.workerId));
  const pending = target.filter((w) => !answered.has(w.id));

  return (
    <div className="space-y-4">
      <Link href="/admin/sondeos" className="text-sm text-stone-500 hover:underline">‹ Sondeos</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1>{poll.title}</h1>
          <p className="text-sm text-stone-500">
            Para {poll.roles.length ? poll.roles.map((r) => ROLE_LABEL[r as Role]).join(", ") : "todo el personal"} · enviado por {poll.createdBy} ·{" "}
            {answered.size} de {target.length} han respondido{poll.closedAt && " · cerrado"}
          </p>
          {poll.message && <p className="mt-1 text-sm">{poll.message}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {!poll.closedAt && pending.length > 0 && <form action={remindPoll.bind(null, poll.id)}><SubmitButton className="btn">Recordar a quien falta ({pending.length})</SubmitButton></form>}
          {!poll.closedAt && <form action={closePoll.bind(null, poll.id)}><ConfirmButton message="¿Cerrar el sondeo? Dejará de aparecer en la app." className="btn">Cerrar</ConfirmButton></form>}
          <form action={deletePoll.bind(null, poll.id)}><ConfirmButton message="¿Borrar el sondeo? Se quitarán también las no disponibilidades que marcó.">Borrar</ConfirmButton></form>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table text-sm">
          <thead><tr><th>Día</th><th className="text-right">Pueden</th><th className="text-right">No pueden</th><th>Quién puede</th><th>Eventos</th></tr></thead>
          <tbody>
            {poll.dates.map((d) => {
              const day = poll.answers.filter((a) => a.date === d);
              const yes = day.filter((a) => a.available).sort((a, b) => a.worker.name.localeCompare(b.worker.name, "es"));
              const evs = events.filter((e) => e.date === d);
              return (
                <tr key={d} className="align-top">
                  <td className="whitespace-nowrap font-medium">{formatDate(d)}</td>
                  <td className="text-right font-semibold text-emerald-700">{yes.length}</td>
                  <td className="text-right text-stone-500">{day.length - yes.length}</td>
                  <td className="min-w-64">{yes.map((a) => a.worker.name).join(", ") || <span className="text-stone-400">—</span>}</td>
                  <td className="whitespace-nowrap">
                    {evs.map((e) => <Link key={e.id} href={`/admin/eventos/${e.id}`} className="link block">{e.name}</Link>)}
                    <Link href={`/admin/eventos/nuevo?fecha=${d}`} className="text-xs text-stone-500 hover:underline">+ Nuevo evento</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pending.length > 0 && (
        <p className="text-sm text-stone-600"><b>Sin responder:</b> {pending.map((w) => w.name).sort((a, b) => a.localeCompare(b, "es")).join(", ")}</p>
      )}
    </div>
  );
}
