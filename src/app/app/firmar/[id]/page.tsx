import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { SignForm } from "./SignForm";

const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "short" });

export default async function SignContract({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireWorker();
  const c = await db.contract.findUnique({ where: { id: (await params).id } });
  if (!c || c.workerId !== me.id) notFound();
  return (
    <div className="space-y-4">
      <Link href={c.kind === "RGPD" ? "/app/perfil" : "/app"} className="text-sm text-stone-500">‹ Volver</Link>
      <h1>{c.title}</h1>
      <article className="card text-sm leading-relaxed whitespace-pre-line">{c.body}</article>
      {c.signedAt ? (
        <div className="card space-y-2 bg-emerald-50">
          <p className="text-emerald-900">✓ Firmado el {when.format(c.signedAt)}.</p>
          <a href={`/api/contracts/${c.id}/pdf`} target="_blank" className="btn">Descargar PDF firmado</a>
          {c.kind === "RGPD" && <Link href="/app/perfil" className="btn btn-primary">Subir mis documentos ›</Link>}
        </div>
      ) : (
        <SignForm id={c.id} kind={c.kind} />
      )}
    </div>
  );
}
