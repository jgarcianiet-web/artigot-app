import { answerPollAction } from "@/app/app/actions";
import { formatDate } from "@/lib/domain";
import type { openPollsFor } from "@/lib/polls";

type Poll = Awaited<ReturnType<typeof openPollsFor>>[number];

/** Sondeo de disponibilidad en el inicio de la app: «Puedo» / «No puedo» por día. */
export function PollCard({ poll, busy }: { poll: Poll; busy: Set<string> }) {
  const answer = new Map(poll.answers.map((a) => [a.date, a.available]));
  const missing = poll.dates.filter((d) => !answer.has(d) && !busy.has(d)).length;
  return (
    <section className={`card space-y-2 ${missing ? "border-sky-300 bg-sky-50" : ""}`}>
      <div>
        <h2>📋 ¿Qué días puedes trabajar?</h2>
        <p className="text-sm text-stone-600">{poll.title}{missing ? ` · te faltan ${missing} días por responder` : " · ¡gracias por responder!"}</p>
        {poll.message && <p className="text-sm">{poll.message}</p>}
      </div>
      <ul className="divide-y divide-stone-200/70">
        {poll.dates.map((d) => {
          const v = answer.get(d);
          return (
            <li key={d} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="font-medium first-letter:uppercase">{formatDate(d, { long: true }).replace(/ de \d{4}$/, "")}</span>
              {busy.has(d) ? (
                <span className="text-xs text-stone-500">Ya tienes servicio</span>
              ) : (
                <span className="flex gap-1.5">
                  <form action={answerPollAction.bind(null, poll.id, d, true)}>
                    <button className={`btn btn-sm ${v === true ? "btn-success" : ""}`} aria-pressed={v === true}>Puedo</button>
                  </form>
                  <form action={answerPollAction.bind(null, poll.id, d, false)}>
                    <button className={`btn btn-sm ${v === false ? "border-stone-800 bg-stone-800 text-white" : ""}`} aria-pressed={v === false}>No puedo</button>
                  </form>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
