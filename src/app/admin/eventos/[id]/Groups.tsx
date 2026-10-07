import Link from "next/link";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { StatusBadge } from "@/components/ui";
import { isLeadRole, ROLE_LABEL, type Role } from "@/lib/domain";
import { deleteGroup, distributeGroups } from "./groupActions";
import { CreateGroups, EditGroup, MoveSelect } from "./GroupForms";

type Group = { id: string; name: string; callTime: string | null; need: number };
type Member = { id: string; workerId: string; role: string; status: string; groupId: string | null; worker: { name: string } };

const byLead = (a: Member, b: Member) =>
  (isLeadRole(a.role) ? 0 : 1) - (isLeadRole(b.role) ? 0 : 1) || (a.status === "CONFIRMADO" ? 0 : 1) - (b.status === "CONFIRMADO" ? 0 : 1) || a.worker.name.localeCompare(b.worker.name, "es");

/**
 * Grupos de un evento grande: cada uno con su maître o camarero responsable y su hora de entrada.
 * Los mozos van aparte con la hora de descarga.
 */
export function Groups({ event, groups, members }: { event: { id: string; startTime: string; needCamareros: number }; groups: Group[]; members: Member[] }) {
  const people = members.filter((m) => m.role !== "MOZO" && (m.status === "CONFIRMADO" || m.status === "CONVOCADO")).sort(byLead);
  const loose = people.filter((m) => !m.groupId);
  const opts = groups.map((g) => ({ id: g.id, name: g.name }));
  const row = (m: Member) => (
    <li key={m.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
      <span className="mr-auto">
        <Link href={`/admin/personal/${m.workerId}`} className="link">{m.worker.name}</Link>
        {isLeadRole(m.role) && <span className="ml-1 rounded bg-brand-100 px-1.5 text-[11px] font-medium">{ROLE_LABEL[m.role as Role]}</span>}
      </span>
      {m.status !== "CONFIRMADO" && <StatusBadge status={m.status} />}
      <MoveSelect assignmentId={m.id} groupId={m.groupId} groups={opts} />
    </li>
  );

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2>Grupos</h2>
            <p className="text-sm text-stone-600">
              Para los eventos grandes: cada grupo lleva su maître o camarero responsable y su hora de entrada, que es la que ven
              sus camareros y la que cuenta para fichar, los retrasos y las horas. Quien acepta la convocatoria entra solo en el
              grupo que más lo necesita; el maître ve y valora solo a su grupo. Los mozos van aparte con la descarga.
            </p>
          </div>
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/eventos/${event.id}/grupos`} target="_blank" className="btn">🖨 Hoja por grupos</Link>
              {loose.length > 0 && (
                <form action={distributeGroups.bind(null, event.id, false)}>
                  <SubmitButton className="btn btn-primary">Repartir a los {loose.length} sin grupo</SubmitButton>
                </form>
              )}
              <form action={distributeGroups.bind(null, event.id, true)}>
                <ConfirmButton message="¿Rehacer el reparto de todos los grupos? A quien cambie de grupo se le avisa." className="btn">
                  Rehacer reparto
                </ConfirmButton>
              </form>
            </div>
          )}
        </div>
        <CreateGroups eventId={event.id} defaultTime={event.startTime} first={groups.length === 0} />
      </section>

      {groups.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => {
            const list = people.filter((m) => m.groupId === g.id);
            const leads = list.filter((m) => isLeadRole(m.role) && m.status === "CONFIRMADO");
            const crew = list.filter((m) => !isLeadRole(m.role) && m.status === "CONFIRMADO").length;
            return (
              <section key={g.id} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {g.name} <span className="font-normal text-stone-500">· entrada {g.callTime ?? event.startTime}</span>
                  </h3>
                  <span className={`text-sm ${g.need && crew < g.need ? "text-amber-700" : "text-emerald-700"}`}>
                    {crew}{g.need ? ` / ${g.need}` : ""} camareros
                  </span>
                </div>
                {leads.length === 0 && <p className="text-sm text-amber-700">⚠ Sin maître ni camarero responsable confirmado.</p>}
                <EditGroup group={g} eventStart={event.startTime} />
                {list.length === 0 ? (
                  <p className="text-sm text-stone-500">Nadie en este grupo todavía.</p>
                ) : (
                  <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">{list.map(row)}</ul>
                )}
                <form action={deleteGroup.bind(null, g.id)} className="text-right">
                  <ConfirmButton message={`¿Borrar ${g.name}? Su gente queda sin grupo, con la hora del evento.`} className="btn btn-sm btn-danger">
                    Borrar grupo
                  </ConfirmButton>
                </form>
              </section>
            );
          })}
        </div>
      )}

      {groups.length > 0 && loose.length > 0 && (
        <section className="card space-y-2">
          <h3 className="font-semibold">Sin grupo ({loose.length}) <span className="font-normal text-stone-500">· entran a las {event.startTime}</span></h3>
          <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">{loose.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
