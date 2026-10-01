import Link from "next/link";
import { FileLink } from "@/components/FileLink";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, num } from "@/lib/domain";
import type { RecordData } from "@/lib/timeRecord";
import { SignForm } from "./SignForm";

const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "short" });

export default async function SignContract({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireWorker();
  const c = await db.contract.findUnique({ where: { id: (await params).id } });
  if (!c || c.workerId !== me.id) notFound();
  return (
    <div className="space-y-4">
      <Link href={c.kind === "RGPD" ? "/app/perfil" : c.kind === "JORNADA" ? "/app/nomina" : "/app"} className="text-sm text-stone-500">‹ Volver</Link>
      <h1>{c.title}</h1>
      <article className="card text-sm leading-relaxed whitespace-pre-line">{c.body}</article>
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
          <FileLink href={`/api/contracts/${c.id}/pdf`} title={c.title} className="btn">Ver PDF firmado</FileLink>
          {c.kind === "RGPD" && <Link href="/app/perfil" className="btn btn-primary">Subir mis documentos ›</Link>}
        </div>
      ) : (
        <SignForm id={c.id} kind={c.kind} />
      )}
    </div>
  );
}
