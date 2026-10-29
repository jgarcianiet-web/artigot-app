import { formatDate } from "@/lib/domain";
import type { openPollsFor } from "@/lib/polls";
import type { DayAnswer } from "@/lib/slots";
import { PollDay } from "./PollDay";

type Poll = Awaited<ReturnType<typeof openPollsFor>>[number];

/** Sondeo de disponibilidad en el inicio de la app: «Puedo» (todo el día, mañana o tarde) / «No puedo» por día. */
export function PollCard({ poll, busy }: { poll: Poll; busy: Set<string> }) {
  const answer = new Map(poll.answers.map((a) => [a.date, (a.available ? (a.slot ?? "DIA") : "NO") as DayAnswer]));
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
          const label = formatDate(d, { long: true }).replace(/ de \d{4}$/, "");
          return busy.has(d) ? (
            <li key={d} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="font-medium first-letter:uppercase">{label}</span>
              <span className="text-xs text-stone-500">Ya tienes servicio</span>
            </li>
          ) : (
            <PollDay key={d} pollId={poll.id} date={d} label={label} answer={answer.get(d) ?? null} />
          );
        })}
      </ul>
    </section>
  );
}
