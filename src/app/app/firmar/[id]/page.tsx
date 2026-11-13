import Link from "next/link";
import { FileLink } from "@/components/FileLink";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, num } from "@/lib/domain";
import type { RecordData } from "@/lib/timeRecord";
import { SignForm } from "./SignForm";
import { requestDocs } from "@/lib/signDocs";
import { canChooseMedical } from "@/lib/prl";

const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "short" });

export default async function SignContract({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireWorker();
  const c = await db.contract.findUnique({ where: { id: (await params).id } });
  if (!c || c.workerId !== me.id) notFound();
  // Documentos que envía RRHH: puede ser más de un PDF; se firman todos de una vez
  const docs = c.kind === "DOCUMENTO" && c.requestId ? await requestDocs(c.requestId) : [];
  const docHref = (i: number) => `/api/contracts/${c.id}/pdf${i ? `?doc=${i}` : ""}`;
  return (
    <div className="space-y-4">
      <Link href={c.kind === "RGPD" ? "/app/perfil" : c.kind === "JORNADA" ? "/app/nomina" : "/app"} className="text-sm text-stone-500">‹ Volver</Link>
      <h1>{c.title}</h1>
      {c.kind === "DOCUMENTO" ? (
        <>
          <p className="text-sm text-stone-500">
            Te lo envía {c.createdBy} (RRHH). {docs.length > 1 ? `Son ${docs.length} documentos: léelos enteros antes de firmar.` : "Léelo entero antes de firmar."}
          </p>
          {c.body && <article className="card text-sm leading-relaxed whitespace-pre-line">{c.body}</article>}
          {!c.signedAt &&
            (docs.length > 1 ? (
              <div className="space-y-2">
                {docs.map((d, i) => (
                  <FileLink key={d.id} href={docHref(i)} title={d.title} className="btn btn-primary w-full justify-start text-left">📄 {i + 1}. {d.title}</FileLink>
                ))}
              </div>
            ) : (
              <FileLink href={docHref(0)} title={c.title} className="btn btn-primary w-full">📄 Leer el documento</FileLink>
            ))}
        </>
      ) : (
        <article className="card text-sm leading-relaxed whitespace-pre-line">{c.body}</article>
      )}
      {c.kind.startsWith("PRL_") && !c.signedAt && (
        <FileLink href={`/api/contracts/${c.id}/pdf`} title={c.title} className="btn w-full">📄 Ver el documento con mis datos</FileLink>
      )}
      {c.kind === "JORNADA" && c.data && (() => {
        const d = c.data as RecordData;
        return (
          <div className="card overflow-x-auto p-0">
            <table className="table text-sm">
              <thead><tr><th>Día</th><th>Evento</th><th>Entrada</th><th>Salida</th><th className="text-right">Horas</th></tr></thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                    <td>{r.event}<div className="text-xs text-stone-500">{r.origin}</div></td>
                    <td>{r.checkIn ?? "—"}</td>
                    <td>{r.checkOut ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.hours != null ? num(r.hours) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold"><td colSpan={4} className="px-3 py-2">Total ({d.days} días)</td><td className="px-3 py-2 text-right">{num(d.totalHours)}</td></tr></tfoot>
            </table>
          </div>
        );
      })()}
      {c.signedAt ? (
        <div className="card space-y-2 bg-emerald-50">
          <p className="text-emerald-900">✓ Firmado el {when.format(c.signedAt)}.</p>
          {c.signerNote && <p className="text-sm text-stone-700">Tus observaciones: {c.signerNote}</p>}
          {docs.length > 1 ? (
            docs.map((d, i) => <FileLink key={d.id} href={docHref(i)} title={d.title} className="btn w-full justify-start text-left">✓ {d.title} · PDF firmado</FileLink>)
          ) : (
            <FileLink href={docHref(0)} title={c.title} className="btn">Ver PDF firmado</FileLink>
          )}
          {c.kind === "RGPD" && <Link href="/app/perfil" className="btn btn-primary">Subir mis documentos ›</Link>}
        </div>
      ) : (
        <SignForm id={c.id} kind={c.kind} medicalChoice={canChooseMedical(me)} docs={docs.map((d) => d.title)} />
      )}
    </div>
  );
}
