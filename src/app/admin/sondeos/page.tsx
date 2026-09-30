import Link from "next/link";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { addDays, formatDate, today } from "@/lib/domain";
import { PollForm } from "./PollForm";

export default async function Polls() {
  const polls = await db.availabilityPoll.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { answers: { select: { workerId: true, available: true } } },
  });
  const t = today();
  return (
    <div className="space-y-4">
      <div>
        <h1>Sondeos de disponibilidad</h1>
        <p className="text-sm text-stone-500">
          Pregunta al personal qué días puede trabajar antes de convocar. Quien dice que <b>no</b> queda como no disponible ese día; quien dice que <b>sí</b> aparece primero al convocar y en «Autocompletar».
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <PollForm defaultFrom={addDays(t, 1)} defaultTo={addDays(t, 30)} />
        <section className="space-y-2">
          <h2>Sondeos</h2>
          {polls.length === 0 ? <Empty>Aún no has enviado ningún sondeo.</Empty> : (
            <ul className="card divide-y p-0">
              {polls.map((p) => {
                const people = new Set(p.answers.map((a) => a.workerId)).size;
                return (
                  <li key={p.id}>
                    <Link href={`/admin/sondeos/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
                      <span>
                        <span className="font-medium">{p.title}</span>
                        <span className="block text-xs text-stone-500">{p.dates.length} días · {formatDate(p.dates[0])} – {formatDate(p.dates.at(-1)!)}</span>
                      </span>
                      <span className="text-right text-sm">
                        {people} {people === 1 ? "respuesta" : "respuestas"}
                        <span className={`block text-xs ${p.closedAt || p.dates.at(-1)! < t ? "text-stone-400" : "text-emerald-700"}`}>{p.closedAt || p.dates.at(-1)! < t ? "Cerrado" : "Abierto"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
