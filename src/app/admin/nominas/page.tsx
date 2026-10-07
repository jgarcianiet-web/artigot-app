import Link from "next/link";
import { Empty } from "@/components/ui";
import { monthBounds, monthLlamamientos } from "@/lib/a3nominas";
import { syncAutoEmployments } from "@/lib/autoAltas";
import { euro, formatDate, num, today } from "@/lib/domain";
import { DownloadNominas } from "./DownloadNominas";

/** Nóminas de los extras del mes para A3: 4 Excel con una fila por llamamiento. */
export default async function Nominas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const t = today();
  const month = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : t.slice(0, 7);
  await syncAutoEmployments().catch((e) => console.error("altas automáticas", e));
  const { from, to } = monthBounds(month);
  const { llamamientos, problems } = await monthLlamamientos(from, to);
  const [y, m] = month.split("-").map(Number);
  const shift = (n: number) => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  const people = new Set(llamamientos.map((l) => l.workerId)).size;
  const total = llamamientos.reduce((s, l) => s + l.net, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto">Nóminas para A3</h1>
        <Link href={`/admin/nominas?mes=${shift(-1)}`} className="btn" aria-label="Mes anterior">‹</Link>
        <span className="min-w-40 text-center font-semibold first-letter:uppercase">{monthName}</span>
        <Link href={`/admin/nominas?mes=${shift(1)}`} className="btn" aria-label="Mes siguiente">›</Link>
      </div>
      <p className="max-w-3xl text-sm text-stone-600">
        Cada llamamiento (los días seguidos que trabaja un extra, con su alta y su baja) es una nómina en A3. En vez de rellenar a mano la contratación, el calendario y el
        líquido de cada una, descarga estos 4 Excel e impórtalos en A3 en este orden; después calcula todas las nóminas de una vez.
      </p>
      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="card p-3"><div className="text-2xl font-semibold">{llamamientos.length}</div><div className="text-xs text-stone-500">Nóminas (llamamientos)</div></div>
        <div className="card p-3"><div className="text-2xl font-semibold">{people}</div><div className="text-xs text-stone-500">Personas</div></div>
        <div className="card p-3"><div className="text-2xl font-semibold">{euro(total)}</div><div className="text-xs text-stone-500">Líquido total</div></div>
      </div>
      {problems.length > 0 && (
        <section className="card space-y-1 border-amber-300 bg-amber-50 text-sm">
          <h2 className="text-base">⚠ {problems.length} {problems.length === 1 ? "llamamiento no va" : "llamamientos no van"} en los Excel hasta que se arreglen</h2>
          <ul className="max-h-60 space-y-0.5 overflow-y-auto">
            {problems.map((p, i) => (
              <li key={i}><Link href={`/admin/personal/${p.workerId}`} className="link">{p.name}</Link> · alta {formatDate(p.alta)}: {p.why}</li>
            ))}
          </ul>
        </section>
      )}
      {llamamientos.length === 0 ? (
        <Empty>No hay llamamientos de extras que empiecen este mes.</Empty>
      ) : (
        <>
          <DownloadNominas month={month} n={llamamientos.length} />
          <ol className="list-decimal space-y-0.5 pl-5 text-sm text-stone-600">
            <li><strong>Contratación-Fechas</strong>: alta, baja y motivo 15. Abre cada llamamiento («Vida Laboral» = Sí).</li>
            <li><strong>Datos Contractuales</strong>: contrato 300, Tipo General, inicio y fin.</li>
            <li><strong>Plantillas Calendario</strong>: los días trabajados con sus horas (jornada parcial).</li>
            <li><strong>Ajuste Salarial</strong>: el líquido pactado de cada nómina; lo que sobra va al concepto del ajuste (22).</li>
          </ol>
          <div className="card overflow-x-auto p-0">
            <table className="table text-sm">
              <thead><tr><th>Persona</th><th>Cód. A3</th><th>Alta</th><th>Baja</th><th>Días (horas)</th><th className="text-right">Líquido</th></tr></thead>
              <tbody>
                {llamamientos.map((l) => (
                  <tr key={l.employmentId}>
                    <td><Link href={`/admin/personal/${l.workerId}`} className="link">{l.name}</Link></td>
                    <td>{l.code}</td>
                    <td className="whitespace-nowrap">{formatDate(l.alta)}</td>
                    <td className="whitespace-nowrap">{formatDate(l.baja)}</td>
                    <td className="text-xs">{l.days.map((d) => `${Number(d.date.slice(8))} (${num(d.hours)} h)`).join(", ")}</td>
                    <td className="text-right tabular-nums">{euro(l.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
