import Link from "next/link";
import { Empty } from "@/components/ui";
import { monthBounds, monthLlamamientos } from "@/lib/a3nominas";
import { syncAutoEmployments } from "@/lib/autoAltas";
import { euro, formatDate, num, today } from "@/lib/domain";
import { DownloadNominas } from "./DownloadNominas";
import { UploadPayslips } from "./UploadPayslips";
import { db } from "@/lib/db";

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
  // Cuadre: líquido que calculó la app (lo que se mandó a A3) frente al que sale en las nóminas de A3
  const slips = await db.payslip.findMany({ where: { month }, include: { worker: { select: { name: true } } } });
  const slipBy = new Map(slips.map((p) => [p.workerId, p]));
  const appBy = new Map<string, { name: string; net: number }>();
  for (const l of llamamientos) appBy.set(l.workerId, { name: l.name, net: (appBy.get(l.workerId)?.net ?? 0) + l.net });
  const check = [...appBy].map(([workerId, a]) => {
    const p = slipBy.get(workerId);
    const diff = p?.net != null ? Math.round((p.net - a.net) * 100) / 100 : null;
    return { workerId, name: a.name, app: a.net, a3: p?.net ?? null, has: !!p, diff };
  });
  const wrong = check.filter((c) => !c.has || c.a3 == null || Math.abs(c.diff ?? 0) >= 0.01).sort((x, y) => Math.abs(y.diff ?? 1e9) - Math.abs(x.diff ?? 1e9));

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
            <li><strong>Contratación-Fechas</strong>: alta, baja y motivo 15. Abre cada llamamiento.</li>
            <li><strong>Datos Contractuales</strong>: contrato 300, Tipo General, inicio y fin, prueba y preaviso, y la ocupación (CNO) del puesto.</li>
            <li><strong>Plantillas Calendario</strong>: un tramo del alta a la baja con los días trabajados y sus horas (jornada parcial).</li>
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
      <section className="card space-y-2">
        <h2 className="text-base">Después de calcular las nóminas en A3: repártelas y cuadra</h2>
        <p className="text-sm text-stone-600">
          Sube el PDF con todas las nóminas del mes que genera A3. La app lo separa por DNI, cada trabajador recibe las suyas en «Nómina» (con un
          aviso) y se compara el líquido de cada nómina con el que calculó la app, para ver las diferencias antes de pagar.
        </p>
        <UploadPayslips month={month} />
        {slips.length > 0 && (
          <>
            <p className="text-sm">
              {slips.length} {slips.length === 1 ? "persona tiene" : "personas tienen"} su nómina de este mes en la app ·{" "}
              {slips.filter((p) => p.seenAt).length} ya la {slips.filter((p) => p.seenAt).length === 1 ? "ha visto" : "han visto"}.
            </p>
            {wrong.length === 0 ? (
              <p className="text-sm font-medium text-emerald-800">✓ Cuadra: el líquido de A3 coincide con el de la app en las {check.length} personas.</p>
            ) : (
              <div className="overflow-x-auto">
                <p className="text-sm font-medium text-amber-800">⚠ {wrong.length} {wrong.length === 1 ? "persona no cuadra" : "personas no cuadran"}:</p>
                <table className="table text-sm">
                  <thead><tr><th>Persona</th><th className="text-right">Líquido app</th><th className="text-right">Líquido A3</th><th className="text-right">Diferencia</th></tr></thead>
                  <tbody>
                    {wrong.map((c) => (
                      <tr key={c.workerId}>
                        <td><Link href={`/admin/personal/${c.workerId}`} className="link">{c.name}</Link></td>
                        <td className="text-right tabular-nums">{euro(c.app)}</td>
                        <td className="text-right tabular-nums">{c.has ? (c.a3 != null ? euro(c.a3) : <span className="text-stone-400">no se ha podido leer</span>) : <span className="text-red-700">sin nómina en el PDF</span>}</td>
                        <td className={`text-right tabular-nums ${c.diff ? "font-semibold text-red-700" : ""}`}>{c.diff != null ? `${c.diff > 0 ? "+" : ""}${euro(c.diff)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
