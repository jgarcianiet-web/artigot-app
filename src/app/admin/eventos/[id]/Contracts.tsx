import { deleteContract } from "@/app/actions";
import { ConfirmButton } from "@/components/client";
import { db } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/domain";
import { covers } from "@/lib/employment";
import { registerEventAltasForm } from "@/app/admin/altas/actions";
import { GenerateContracts } from "./GenerateContracts";

const when = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(d);

/** Documento de condiciones del servicio de cada confirmado y alta en la Seguridad Social. */
export async function Contracts({ eventId, eventDate, confirmed }: { eventId: string; eventDate: string; confirmed: { id: string; role: string; workerId: string; worker: { name: string; dni: string | null; nss: string | null } }[] }) {
  const [contracts, employments] = await Promise.all([
    db.contract.findMany({ where: { eventId }, select: { id: true, assignmentId: true, signedAt: true } }),
    db.employment.findMany({ where: { workerId: { in: confirmed.map((a) => a.workerId) } }, select: { workerId: true, startDate: true, endDate: true, startReported: true } }),
  ]);
  const alta = (workerId: string) => employments.find((e) => e.workerId === workerId && covers(e, eventDate));
  const withoutAlta = confirmed.filter((a) => !alta(a.workerId)).length;
  const byAssignment = new Map(contracts.map((c) => [c.assignmentId, c]));
  const withoutDoc = confirmed.filter((a) => !byAssignment.has(a.id)).length;
  const signed = contracts.filter((c) => c.signedAt).length;
  const missingData = confirmed.filter((a) => !a.worker.dni || !a.worker.nss);
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Documentos y altas</h2>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/eventos/${eventId}/alta`} className="btn">Datos para el alta en la S. S. (Excel)</a>
          {withoutAlta > 0 && (
            <form action={registerEventAltasForm.bind(null, eventId)}>
              <button className="btn">Registrar altas ({withoutAlta})</button>
            </form>
          )}
          <GenerateContracts eventId={eventId} pending={withoutDoc} />
        </div>
      </div>
      <p className="text-sm text-stone-600">
        {withoutAlta ? <span className="text-red-700">{withoutAlta} sin alta en la Seguridad Social ese día. </span> : "Todo el equipo tiene alta ese día. "}
        {contracts.length ? `${signed} de ${contracts.length} documentos firmados.` : "Aún no se han generado los documentos de condiciones."}
        {missingData.length > 0 && (
          <span className="ml-1 text-amber-700">Faltan DNI o nº de la Seguridad Social de: {missingData.map((a) => a.worker.name).join(", ")}.</span>
        )}
      </p>
      {confirmed.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Puesto</th><th>Alta S. S.</th><th>Documento</th><th /></tr></thead>
            <tbody>
              {confirmed.map((a) => {
                const c = byAssignment.get(a.id);
                return (
                  <tr key={a.id}>
                    <td>{a.worker.name}</td>
                    <td>{ROLE_LABEL[a.role as Role] ?? a.role}</td>
                    <td>
                      {(() => {
                        const e = alta(a.workerId);
                        return !e ? <span className="text-red-600">✗ Sin alta</span> : e.startReported ? <span className="text-green-700">✓ Comunicada</span> : <span className="text-amber-700">Registrada, sin comunicar</span>;
                      })()}
                    </td>
                    <td>
                      {!c ? <span className="text-stone-400">Sin generar</span>
                        : c.signedAt ? <span className="text-green-700">✓ Firmado {when(c.signedAt)}</span>
                        : <span className="text-amber-700">Pendiente de firma</span>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {c && (
                        <div className="flex justify-end gap-2">
                          <a href={`/api/contracts/${c.id}/pdf`} className="link text-sm" target="_blank">PDF</a>
                          {!c.signedAt && (
                            <form action={deleteContract.bind(null, c.id)}>
                              <ConfirmButton message="¿Anular este documento? Podrás generarlo de nuevo." className="text-sm text-red-700 underline">Anular</ConfirmButton>
                            </form>
                          )}
                        </div>
                      )}
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
