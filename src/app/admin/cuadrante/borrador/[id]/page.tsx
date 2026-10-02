import Link from "next/link";
import { notFound } from "next/navigation";
import { addDraftStaff, confirmDraft, deleteDraft, removeDraftStaff, saveDraft } from "@/app/actions";
import { EventForm } from "@/app/admin/eventos/EventForm";
import { ConfirmButton, ListFilter, SelectAll, SubmitButton } from "@/components/client";
import { RoleBadge } from "@/components/ui";
import { eventFormOptions } from "@/lib/catalog";
import { CLOCK_RADIUS_M } from "@/lib/clockRules";
import { db } from "@/lib/db";
import { euro, formatDate, isFixed, isRole, payable, rateFor, hoursBetween, callTime, ROLE_LABEL, ROLE_PLURAL, ROLES, type Role } from "@/lib/domain";
import { ConfirmDraft } from "./ConfirmDraft";

type Staff = { workerId: string; role: Role }[];
const NEED: Record<Role, string> = { CAMARERO: "needCamareros", RESPONSABLE: "needResponsables", MAITRE: "needMaitres", MOZO: "needMozos" };

/** Borrador del cuadrante: datos del evento, personal previsto y «Confirmar y convocar». */
export default async function Draft({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { id } = await params;
  const { ok } = await searchParams;
  const d = await db.eventDraft.findUnique({ where: { id } });
  if (!d) notFound();
  const f = d.form as Record<string, string>;
  const staff = (d.staff as Staff).filter((x) => isRole(x.role));
  const num = (k: string) => (f[k] != null && f[k] !== "" && Number.isFinite(Number(f[k])) ? Number(f[k]) : null);
  const ev = {
    id: d.id, name: f.name ?? d.name, type: f.type ?? "BODA", date: f.date ?? d.date, startTime: f.startTime ?? "18:00", endTime: f.endTime || null, unloadTime: f.unloadTime || null,
    venue: f.venue ?? "", lat: num("lat"), lng: num("lng"), client: f.client || null, salesRep: f.salesRep || null, budget: num("budget"), budgetNote: f.budgetNote || null,
    notes: f.notes || null, checklist: f.checklist || null, needCamareros: num("needCamareros") ?? 0, needMaitres: num("needMaitres") ?? 0, needResponsables: num("needResponsables") ?? 0,
    needMozos: num("needMozos") ?? 0, autoReplace: f.autoReplace === "1", venueId: f.venueId || null, clientId: f.clientId || null,
  };

  const [workers, busy, off, otherDrafts, rates, options] = await Promise.all([
    db.worker.findMany({ where: { active: true }, select: { id: true, name: true, role: true, roles: true, zone: true, phone: true, contractCode: true, customRates: true }, orderBy: { name: "asc" } }),
    db.assignment.findMany({ where: { status: { in: ["CONVOCADO", "CONFIRMADO"] }, event: { date: ev.date, status: { not: "CANCELADO" } } }, select: { workerId: true, event: { select: { name: true } } } }),
    db.unavailability.findMany({ where: { date: ev.date }, select: { workerId: true } }),
    db.eventDraft.findMany({ where: { date: ev.date, id: { not: d.id } }, select: { name: true, staff: true } }),
    db.rate.findMany(),
    eventFormOptions(),
  ]);
  const busyBy = new Map(busy.map((b) => [b.workerId, b.event.name]));
  const offSet = new Set(off.map((u) => u.workerId));
  const draftBy = new Map(otherDrafts.flatMap((o) => (o.staff as Staff).map((x) => [x.workerId, o.name] as const)));
  const byId = new Map(workers.map((w) => [w.id, w]));
  const planned = new Set(staff.map((x) => x.workerId));
  const warn = (id: string) => (offSet.has(id) ? "No disponible ese día" : busyBy.get(id) ? `Ya va a ${busyBy.get(id)}` : draftBy.get(id) ? `En el borrador ${draftBy.get(id)}` : null);
  const amount = (id: string, role: Role) => payable(hoursBetween(callTime(ev, role), ev.endTime), rateFor(rates, role, ev.type, byId.get(id)?.customRates)).amount;
  const total = staff.reduce((s, x) => s + amount(x.workerId, x.role), 0);

  return (
    <div className="space-y-4">
      <Link href={`/admin/cuadrante?semana=${ev.date}`} className="text-sm text-stone-500 hover:underline">‹ Cuadrante</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-amber-700">BORRADOR · solo lo ve RRHH, no avisa a nadie</p>
          <h1>{ev.name}</h1>
          <p className="text-sm text-stone-600">{formatDate(ev.date, { long: true })} · {ev.startTime}{ev.endTime && `–${ev.endTime}`} · {ev.venue || "sin lugar"}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ConfirmDraft action={confirmDraft.bind(null, d.id)} people={staff.length} />
          <form action={deleteDraft.bind(null, d.id)}>
            <ConfirmButton message="¿Borrar este borrador?" className="btn">Borrar</ConfirmButton>
          </form>
        </div>
      </div>
      {ok && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">✓ Borrador guardado.</p>}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>Personal previsto ({staff.length})</h2>
          <span className="text-sm text-stone-500">Coste previsto {euro(total)}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {ROLES.map((r) => {
            const need = (ev as unknown as Record<string, number>)[NEED[r]];
            const n = staff.filter((x) => x.role === r).length;
            return need || n ? <span key={r} className={`rounded-full px-2 py-0.5 ${n < need ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{ROLE_PLURAL[r]} {n}/{need}</span> : null;
          })}
        </div>
        {staff.length === 0 ? (
          <p className="text-sm text-stone-500">Aún no hay nadie. Añádelos abajo por puesto.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {staff.map((x) => {
              const w = byId.get(x.workerId);
              const wn = warn(x.workerId);
              return (
                <li key={x.workerId} className="flex flex-wrap items-center gap-2 py-1.5">
                  <RoleBadge role={x.role} />
                  <span className="font-medium">{w?.name ?? "(ya no está activo)"}</span>
                  {w && isFixed(w) && <span className="rounded bg-sky-100 px-1 text-[11px] text-sky-800">Fijo</span>}
                  {wn && <span className="text-xs text-amber-700">⚠ {wn}</span>}
                  <span className="ml-auto text-stone-500 tabular-nums">{euro(amount(x.workerId, x.role))}</span>
                  <form action={removeDraftStaff.bind(null, d.id, x.workerId)}>
                    <button className="btn btn-sm" aria-label={`Quitar a ${w?.name}`}>Quitar</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2>Añadir personal</h2>
        {ROLES.map((r) => {
          const list = workers
            .filter((w) => !planned.has(w.id) && (w.role === r || w.roles.includes(r)))
            .sort((a, b) => Number(!!warn(a.id)) - Number(!!warn(b.id)) || a.name.localeCompare(b.name, "es"));
          const need = (ev as unknown as Record<string, number>)[NEED[r]];
          const n = staff.filter((x) => x.role === r).length;
          return (
            <details key={r} className="card" open={n < need}>
              <summary className="cursor-pointer font-semibold">{ROLE_PLURAL[r]} <span className="text-sm font-normal text-stone-500">· {n}/{need} · {list.length} disponibles para elegir</span></summary>
              <form action={addDraftStaff.bind(null, d.id)} className="mt-3 space-y-2">
                <input type="hidden" name="role" value={r} />
                <ListFilter name="workerId" />
                <div className="max-h-96 overflow-y-auto rounded border border-stone-200">
                  <table className="table text-sm">
                    <thead><tr><th className="w-8"><SelectAll name="workerId" /></th><th>Nombre</th><th>Zona</th><th /></tr></thead>
                    <tbody>
                      {list.map((w) => {
                        const wn = warn(w.id);
                        return (
                          <tr key={w.id} data-search={`${w.name} ${w.zone ?? ""} ${w.phone ?? ""}`} className={wn ? "text-stone-400" : ""}>
                            <td><input type="checkbox" name="workerId" value={w.id} className="size-4" aria-label={`Elegir a ${w.name}`} /></td>
                            <td>{w.name}{isFixed(w) && <span className="ml-1 rounded bg-sky-100 px-1 text-[11px] text-sky-800">Fijo</span>}</td>
                            <td>{w.zone}</td>
                            <td className="text-xs text-amber-700">{wn}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <SubmitButton className="btn btn-primary btn-sm">Añadir como {ROLE_LABEL[r].toLowerCase()}</SubmitButton>
              </form>
            </details>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2>Datos del evento</h2>
        <EventForm event={ev} {...options} radius={CLOCK_RADIUS_M} draft={{ id: d.id, action: saveDraft }} />
      </section>
    </div>
  );
}
