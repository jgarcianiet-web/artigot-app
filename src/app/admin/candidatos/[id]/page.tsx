import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCandidate, hireCandidateAction, updateCandidate } from "@/app/actions";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { RoleBadge } from "@/components/ui";
import { CANDIDATE_STATUS } from "@/lib/candidates";
import { db } from "@/lib/db";
import { ROLE_LABEL, ROLES } from "@/lib/domain";

const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "short" });

export default async function CandidateDetail({ params }: { params: Promise<{ id: string }> }) {
  const c = await db.candidate.findUnique({ where: { id: (await params).id } });
  if (!c) notFound();
  const existing = await db.worker.findUnique({ where: { phoneKey: c.phoneKey }, select: { id: true, name: true } });
  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/admin/candidatos" className="text-sm text-stone-500 hover:underline">‹ Candidatos</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1>{c.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {c.roles.map((r) => <RoleBadge key={r} role={r} />)}
            <a href={`tel:${c.phone}`}>{c.phone}</a>
            {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            {c.zone && <span className="text-stone-500">· {c.zone}</span>}
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm ${CANDIDATE_STATUS[c.status].cls}`}>{CANDIDATE_STATUS[c.status].label}</span>
      </div>
      <section className="card space-y-2 text-sm">
        <p><strong>Experiencia:</strong> {c.experience ?? "—"}</p>
        <p><strong>Disponibilidad:</strong> {c.availability ?? "—"}</p>
        {c.fileId && <a href={`/api/files/${c.fileId}`} target="_blank" className="btn btn-sm">📎 Ver CV / foto</a>}
        <p className="text-xs text-stone-500">Solicitud del {when.format(c.createdAt)} · consentimiento de datos aceptado el {when.format(c.consentAt)}</p>
      </section>

      {c.workerId ? (
        <p className="card bg-emerald-50 text-sm">✓ Dado de alta. <Link href={`/admin/personal/${c.workerId}`} className="link">Ver su ficha y código de acceso</Link></p>
      ) : (
        <form action={hireCandidateAction.bind(null, c.id)} className="card flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="role">Dar de alta como</label>
            <select id="role" name="role" className="input" defaultValue={c.roles[0] ?? "CAMARERO"}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <SubmitButton>{existing ? `Enlazar con ${existing.name}` : "Dar de alta como trabajador"}</SubmitButton>
          <p className="w-full text-xs text-stone-500">
            {existing ? "Ya existe un trabajador con este teléfono: se enlazará con él." : "Se crea su ficha con un código de acceso a la app."}
          </p>
        </form>
      )}

      <form action={updateCandidate.bind(null, c.id)} className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {["NUEVO", "CONTACTADO", "DESCARTADO"].map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="status" value={s} defaultChecked={c.status === s} /> {CANDIDATE_STATUS[s].label}
            </label>
          ))}
        </div>
        <textarea name="notes" rows={3} className="input" defaultValue={c.notes ?? ""} placeholder="Notas internas (entrevista, referencias…)" />
        <SubmitButton className="btn">Guardar</SubmitButton>
      </form>

      <form action={deleteCandidate.bind(null, c.id)}>
        <ConfirmButton message="¿Borrar definitivamente los datos de este candidato (p. ej. si lo pide)?">Borrar sus datos</ConfirmButton>
      </form>
    </div>
  );
}
