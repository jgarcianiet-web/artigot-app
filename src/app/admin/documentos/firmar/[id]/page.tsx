import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton, CopyButton, SubmitButton } from "@/components/client";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isExpired, signLink } from "@/lib/externalSign";
import { cancelSignAction, deleteSignAction, remindSignAction } from "../actions";

const when = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

/** Un documento enviado a firmar: quién ha firmado, su copia firmada, recordar, anular y borrar. */
export default async function SignRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const r = await db.signRequest.findUnique({
    where: { id: (await params).id },
    include: {
      contracts: { include: { worker: { select: { id: true, name: true, dni: true } } }, orderBy: [{ signedAt: { sort: "asc", nulls: "first" } }, { worker: { name: "asc" } }] },
      externals: { orderBy: [{ signedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }] },
    },
  });
  if (!r) notFound();
  const total = r.contracts.length + r.externals.length;
  const pending = [...r.contracts, ...r.externals].filter((c) => !c.signedAt);
  const signed = total - pending.length;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href="/admin/documentos/firmar" className="text-sm text-stone-500 hover:underline">‹ Para firmar</Link>
        <h1>{r.title}</h1>
        <p className="text-sm text-stone-500">
          Enviado el {when(r.createdAt)} por {r.createdBy} · {signed} de {total} han firmado ·{" "}
          <a href={`/api/files/${r.fileId}`} target="_blank" className="link">Ver el PDF enviado</a>
        </p>
        {r.message && <p className="card text-sm whitespace-pre-line">{r.message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {pending.length > 0 && (
          <>
            <form action={remindSignAction.bind(null, r.id)}>
              <SubmitButton className="btn">🔔 Recordar a quien falta ({pending.length})</SubmitButton>
            </form>
            <form action={cancelSignAction.bind(null, r.id)}>
              <ConfirmButton className="btn btn-danger" message={`¿Anular las ${pending.length} firmas pendientes? Las ya firmadas se conservan.`}>Anular las pendientes</ConfirmButton>
            </form>
          </>
        )}
        <form action={deleteSignAction.bind(null, r.id)} className="ml-auto">
          <ConfirmButton
            className="btn btn-danger"
            message={`¿Borrar «${r.title}» del todo? Se borran el PDF y ${signed ? `también las ${signed} firmas ya hechas` : "las firmas pendientes"}, desaparece de la app del personal y los enlaces de fuera dejan de funcionar. No se puede deshacer.`}
          >
            🗑 Borrar el envío
          </ConfirmButton>
        </form>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table text-sm">
          <thead><tr><th>Persona</th><th>DNI</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {r.contracts.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/admin/personal/${c.worker.id}`} className="link">{c.worker.name}</Link></td>
                <td className="text-stone-500">{c.worker.dni ?? "—"}</td>
                <td>
                  {c.signedAt ? (
                    <span className="text-emerald-700">✓ Firmado el {when(c.signedAt)}{c.signerNote ? ` · observaciones: ${c.signerNote}` : ""}</span>
                  ) : (
                    <span className="text-amber-700">Pendiente</span>
                  )}
                </td>
                <td className="text-right">{c.signedAt && <a href={`/api/contracts/${c.id}/pdf`} target="_blank" className="link">PDF firmado</a>}</td>
              </tr>
            ))}
            {r.externals.map((x) => (
              <tr key={x.id} className="align-top">
                <td>
                  {x.name} <span className="ml-1 rounded bg-stone-100 px-1.5 text-[11px] text-stone-600">de fuera</span>
                  <div className="text-xs text-stone-500">{x.email}{x.phone ? ` · ${x.phone}` : ""}</div>
                </td>
                <td className="text-stone-500">{x.dni ?? "—"}</td>
                <td>
                  {x.signedAt ? (
                    <span className="text-emerald-700">✓ Firmado el {when(x.signedAt)}{x.signerNote ? ` · observaciones: ${x.signerNote}` : ""}</span>
                  ) : isExpired(x) ? (
                    <span className="text-red-700">Enlace caducado · «Recordar» lo renueva</span>
                  ) : (
                    <span className="text-amber-700">
                      Pendiente{x.verifiedAt ? " · ha abierto el documento" : x.codeSentAt ? " · ha pedido el código" : ""}
                      <span className="block text-xs text-stone-500">El enlace vale hasta el {when(x.expiresAt)}</span>
                    </span>
                  )}
                </td>
                <td className="text-right">
                  {x.signedAt ? (
                    <a href={`/api/firma-externa/${x.id}/pdf`} target="_blank" className="link">PDF firmado</a>
                  ) : (
                    !isExpired(x) && (
                      <span className="flex flex-wrap justify-end gap-1.5">
                        <CopyButton text={signLink(x.token)} label="Copiar enlace" />
                        <WhatsAppButton phone={x.phone} text={`Hola ${x.name.split(" ")[0]}, te envío «${r.title}» de Artigot Catering para que lo firmes. Abre este enlace; te llegará un código a tu email para abrirlo: ${signLink(x.token)}`}>
                          WhatsApp
                        </WhatsAppButton>
                      </span>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
