import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, formatDate } from "@/lib/domain";
import { isEventMaitre, REVIEW_DAYS, reviewTeam, reviewWindowOpen } from "@/lib/reviews";
import { ReviewForm } from "./ReviewForm";

export default async function RateTeam({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireWorker();
  const event = await db.event.findUnique({ where: { id } });
  if (!event || !(await isEventMaitre(id, me.id))) notFound();

  const [team, reviews] = await Promise.all([
    reviewTeam(id),
    db.review.findMany({ where: { eventId: id, reviewerId: me.id } }),
  ]);
  const byWorker = new Map(reviews.map((r) => [r.workerId, r]));
  const open = reviewWindowOpen(event);

  return (
    <div className="space-y-4">
      <Link href="/app" className="text-sm text-stone-500">‹ Volver</Link>
      <div>
        <h1>Valora a tu equipo</h1>
        <p className="text-sm text-stone-500">
          {event.name} · {formatDate(event.date)}. Puntúa de 1 a 5 a cada persona. Solo lo ve RRHH y sirve para elegir al
          personal de los próximos eventos.
        </p>
      </div>
      {!open ? (
        <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">
          Podrás valorar desde el inicio del servicio hasta el {formatDate(addDays(event.date, REVIEW_DAYS))}.
        </p>
      ) : team.length === 0 ? (
        <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">No hay personal confirmado que valorar en este evento.</p>
      ) : (
        <ReviewForm
          eventId={id}
          members={team.map((a) => {
            const r = byWorker.get(a.workerId);
            return {
              workerId: a.workerId,
              name: a.worker.name,
              role: a.role,
              existing: r
                ? { noShow: r.noShow, punctuality: r.punctuality, appearance: r.appearance, service: r.service, attitude: r.attitude, comment: r.comment }
                : null,
            };
          })}
        />
      )}
    </div>
  );
}
