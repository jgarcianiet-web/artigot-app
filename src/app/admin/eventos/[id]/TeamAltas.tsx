import { db } from "@/lib/db";
import { isFixed, ROLE_LABEL, type Role } from "@/lib/domain";
import { covers } from "@/lib/employment";
import { movementsBetween, syncAutoEmployments } from "@/lib/autoAltas";

const MOVE = {
  ALTA: ["ALTA", "bg-emerald-600", "Empieza este día y sigue mañana"],
  ALTA_BAJA: ["ALTA y BAJA", "bg-amber-500", "Solo trabaja este día"],
  SIGUE: ["SIGUE", "bg-sky-600", "Trabajó ayer y trabaja mañana"],
  BAJA: ["BAJA", "bg-red-600", "Último día: baja este día"],
} as const;

/** Alta en la Seguridad Social de cada confirmado. */
export async function TeamAltas({ eventId, eventDate, confirmed }: { eventId: string; eventDate: string; confirmed: { id: string; role: string; workerId: string; worker: { name: string; dni: string | null; nss: string | null; a3Code: string | null; contractCode: string | null } }[] }) {
  // Se calcula solo con los confirmados: aquí solo se ve (y se descargan los Excel del día)
  await syncAutoEmployments();
  const moves = await movementsBetween(eventDate, eventDate);
  const move = (workerId: string) => {
    const m = moves.get(`${workerId}|${eventDate}`);
    return m ? MOVE[m.alta ? (m.sigue ? "ALTA" : "ALTA_BAJA") : m.sigue ? "SIGUE" : "BAJA"] : null;
  };
  const employments = await db.employment.findMany({ where: { workerId: { in: confirmed.map((a) => a.workerId) } }, select: { workerId: true, startDate: true, endDate: true, startReported: true } });
  const alta = (workerId: string) => employments.find((e) => e.workerId === workerId && covers(e, eventDate));
  const withoutAlta = confirmed.filter((a) => !isFixed(a.worker) && !alta(a.workerId)).length;
  const missingData = confirmed.filter((a) => !a.worker.dni || !a.worker.nss);
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Altas en la Seguridad Social <span className="text-sm font-normal text-stone-500">· se hacen solas con los confirmados</span></h2>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/eventos/${eventId}/alta`} className="btn">Datos para el alta en la S. S. (Excel)</a>
          <a href={`/admin/altas?dia=${eventDate}`} className="btn btn-primary">Altas y bajas del día (Excel para A3)</a>
        </div>
      </div>
      <p className="text-sm text-stone-600">
        {withoutAlta ? <span className="text-red-700">{withoutAlta} sin alta en la Seguridad Social ese día. </span> : "Todo el equipo tiene alta ese día. "}
        {missingData.length > 0 && (
          <span className="ml-1 text-amber-700">Faltan DNI o nº de la Seguridad Social de: {missingData.map((a) => a.worker.name).join(", ")}.</span>
        )}
      </p>
      {confirmed.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Puesto</th><th>Este día</th><th>Alta S. S.</th></tr></thead>
            <tbody>
              {confirmed.map((a) => {
                return (
                  <tr key={a.id}>
                    <td>{a.worker.name}</td>
                    <td>{ROLE_LABEL[a.role as Role] ?? a.role}</td>
                    <td>
                      {(() => {
                        if (isFixed(a.worker)) return <span className="text-xs text-stone-500">Fijo (alta todo el año)</span>;
                        const m = move(a.workerId);
                        return m && <span title={m[2]} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${m[1]}`}>{m[0]}</span>;
                      })()}
                      {!isFixed(a.worker) && !a.worker.a3Code && <span className="ml-1 text-xs text-amber-700" title="Va en el alta masiva de A3">sin código A3</span>}
                    </td>
                    <td>
                      {(() => {
                        if (isFixed(a.worker)) return <span className="text-stone-400">—</span>;
                        const e = alta(a.workerId);
                        return !e ? <span className="text-red-600">✗ Sin alta</span> : e.startReported ? <span className="text-green-700">✓ Comunicada</span> : <span className="text-amber-700">Registrada, sin comunicar</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
