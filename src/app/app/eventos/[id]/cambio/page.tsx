import Link from "next/link";
import { notFound } from "next/navigation";
import { SwapProposalForm } from "@/components/StaffForms";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, ROLE_LABEL, today, type Role } from "@/lib/domain";
import { OPEN_SWAP, swapPartners } from "@/lib/swaps";
import { cancelMySwap, proposeMySwap } from "../../../actions";

const STATUS: Record<string, string> = {
  PROPUESTO: "Esperando respuesta de tu compañero",
  ACEPTADO: "Tu compañero ha aceptado. Falta que RRHH lo apruebe",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  CANCELADO: "Cancelado",
};

export default async function SwapShift({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireWorker();
  const a = await db.assignment.findUnique({
    where: { eventId_workerId: { eventId: id, workerId: me.id } },
    include: { event: true, swaps: { include: { toWorker: { select: { name: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!a || a.status !== "CONFIRMADO" || a.event.date < today()) notFound();
  const open = a.swaps.find((s) => OPEN_SWAP.includes(s.status));
  const partners = open ? [] : await swapPartners(a);

  return (
    <div className="space-y-4">
      <Link href={`/app/eventos/${id}`} className="text-sm text-stone-500">‹ Volver</Link>
      <div>
        <h1>Cambiar mi turno</h1>
        <p className="text-sm text-stone-500">
          {a.event.name} · {formatDate(a.event.date)} · {ROLE_LABEL[a.role as Role]}
        </p>
      </div>
      {open ? (
        <div className="card space-y-2">
          <p><strong>{open.toWorker.name}</strong>: {STATUS[open.status]}.</p>
          <p className="text-sm text-stone-500">Hasta que RRHH lo apruebe, el turno sigue siendo tuyo.</p>
          <form action={cancelMySwap.bind(null, open.id)}>
            <button className="btn btn-sm btn-danger">Cancelar la propuesta</button>
          </form>
        </div>
      ) : partners.length === 0 ? (
        <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">
          No hay compañeros libres ese día para tu puesto. Si no puedes ir, usa «Ya no puedo ir» y RRHH buscará sustituto.
        </p>
      ) : (
        <SwapProposalForm action={proposeMySwap.bind(null, a.id)} partners={partners.map((p) => ({ id: p.id, name: p.name, zone: p.zone }))} />
      )}
      {a.swaps.filter((s) => !OPEN_SWAP.includes(s.status)).length > 0 && (
        <section className="space-y-1 text-sm">
          <h2>Propuestas anteriores</h2>
          {a.swaps.filter((s) => !OPEN_SWAP.includes(s.status)).map((s) => (
            <p key={s.id} className="text-stone-600">{s.toWorker.name}: {STATUS[s.status]}</p>
          ))}
        </section>
      )}
    </div>
  );
}
