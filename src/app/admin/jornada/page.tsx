import Link from "next/link";
import { Empty } from "@/components/ui";
import { num, today } from "@/lib/domain";
import { changedSinceSigned, lastDayOf, monthLabel, monthRecordDocs, monthRecords, shiftMonth } from "@/lib/timeRecord";
import { GenerateButton } from "./GenerateButton";

export default async function TimeRecords({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const current = today().slice(0, 7);
  const month = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) && sp.mes <= current ? sp.mes : shiftMonth(current, -1);
  const [records, docs] = await Promise.all([monthRecords(month), monthRecordDocs(month)]);
  const docOf = (id: string) => docs.find((d) => d.workerId === id);
  const signed = records.filter((r) => docOf(r.worker.id)?.signedAt).length;
  const ended = lastDayOf(month) < today();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1>Registro de jornada</h1>
          <p className="text-sm text-stone-500">
            Hora de entrada y salida de cada día trabajado (art. 34.9 del Estatuto de los Trabajadores). Hay que conservarlo 4 años y enseñarlo si lo pide la Inspección de Trabajo.
          </p>
        </div>
        <a href={`/admin/jornada/exportar?mes=${month}`} className="btn">Exportar el mes (Excel)</a>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/admin/jornada?mes=${shiftMonth(month, -1)}`} className="btn" aria-label="Mes anterior">‹</Link>
        <span className="min-w-40 text-center font-semibold first-letter:uppercase">{monthLabel(month)}</span>
        {month < current ? <Link href={`/admin/jornada?mes=${shiftMonth(month, 1)}`} className="btn" aria-label="Mes siguiente">›</Link> : <span className="w-10" />}
      </div>

      {records.length === 0 ? (
        <Empty>No hay servicios confirmados en {monthLabel(month)}.</Empty>
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {records.length} personas · {signed} han firmado su registro.
              {!ended && <span className="ml-1 text-amber-700">El mes aún no ha terminado: lo normal es enviarlo a firmar a principios del mes siguiente.</span>}
            </p>
            <GenerateButton month={month} label={docs.length ? "Enviar a firmar a los que faltan" : "Enviar a firmar a todos"} />
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="table text-sm">
              <thead><tr><th>Persona</th><th className="text-right">Días</th><th className="text-right">Horas</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {records.map(({ worker, data }) => {
                  const d = docOf(worker.id);
                  const changed = d?.signedAt && changedSinceSigned(d.data, data);
                  return (
                    <tr key={worker.id} className="align-top">
                      <td>
                        <Link href={`/admin/personal/${worker.id}`} className="link">{worker.name}</Link>
                        {data.incomplete > 0 && <div className="text-xs text-amber-700">{data.incomplete} sin entrada o salida</div>}
                      </td>
                      <td className="text-right">{data.days}</td>
                      <td className="text-right tabular-nums">{num(data.totalHours)}</td>
                      <td>
                        {!d ? <span className="text-stone-400">Sin enviar</span>
                          : d.signedAt ? <span className="text-emerald-700">✓ Firmado</span>
                          : <span className="text-amber-700">Pendiente de firma</span>}
                        {d?.signerNote && <div className="text-xs text-red-700">Observaciones: {d.signerNote}</div>}
                        {changed && <div className="text-xs text-red-700">⚠ Las horas han cambiado después de firmar</div>}
                      </td>
                      <td className="text-right">{d && <a href={`/api/contracts/${d.id}/pdf`} target="_blank" className="link">PDF</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
