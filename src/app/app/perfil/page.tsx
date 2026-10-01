import Link from "next/link";
import { DocumentUploadForm, MyDataForm } from "@/components/StaffForms";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, ROLE_LABEL, today, type Role } from "@/lib/domain";
import { DOC_LABEL, docState } from "@/lib/staff";
import { privacySignature } from "@/lib/privacy";
import { identityDocStatus } from "@/lib/identityDocs";
import { deleteMyDocument, logout, saveMyData, startPrivacySignature, uploadMyDocument } from "../actions";

const STATE = {
  "sin-caducidad": "",
  vigente: "text-stone-500",
  "caduca-pronto": "font-medium text-amber-700",
  caducado: "font-medium text-red-700",
} as const;

export default async function MyProfile() {
  const me = await requireWorker();
  const t = today();
  const worker = await db.worker.findUniqueOrThrow({
    where: { id: me.id },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      loans: { where: { returnedAt: null }, orderBy: { deliveredAt: "desc" } },
      contracts: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, signedAt: true } },
    },
  });
  const privacy = await privacySignature(me.id);
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-stone-500">{ROLE_LABEL[worker.role as Role]} · {worker.phone}</p>
        <h1>{worker.name}</h1>
      </header>

      {privacy ? (
        <MyDataForm action={saveMyData} data={worker} docs={await identityDocStatus(me.id)} />
      ) : (
        <section className="card space-y-2 border-stone-300 bg-stone-100">
          <h2>🔒 Completa tus datos</h2>
          <p className="text-sm">
            Para darte de alta y pagarte necesitamos tu DNI, tu número de la Seguridad Social y tu IBAN, con sus documentos. Antes tienes que leer y firmar la
            información sobre protección de datos: qué datos tratamos, para qué y tus derechos.
          </p>
          <form action={startPrivacySignature}>
            <button className="btn btn-primary w-full">Leer y firmar</button>
          </form>
        </section>
      )}

      {worker.contracts.length > 0 && (
        <section className="space-y-2">
          <h2>Condiciones de servicio</h2>
          <ul className="card divide-y p-0">
            {worker.contracts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0 truncate">{c.title}</span>
                {c.signedAt ? (
                  <a href={`/api/contracts/${c.id}/pdf`} target="_blank" className="link shrink-0">✓ PDF</a>
                ) : (
                  <Link href={`/app/firmar/${c.id}`} className="shrink-0 font-medium text-stone-900 underline">Firmar ›</Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2>Mis documentos</h2>
        {worker.documents.length === 0 && <p className="text-sm text-stone-500">Aún no has subido ningún documento.</p>}
        <ul className="card divide-y divide-stone-100 p-0">
          {worker.documents.map((d) => {
            const st = docState(d.expiresAt, t);
            return (
              <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{DOC_LABEL[d.type] ?? d.type}{d.label && ` · ${d.label}`}</div>
                  <div className={`text-xs ${STATE[st]}`}>
                    {d.expiresAt ? (st === "caducado" ? `Caducado el ${formatDate(d.expiresAt)}` : `Caduca el ${formatDate(d.expiresAt)}`) : "Sin caducidad"}
                    {" · "}
                    {d.verified ? <span className="text-emerald-700">✓ Revisado por RRHH</span> : "Pendiente de revisar"}
                  </div>
                </div>
                {d.fileId && <a href={`/api/files/${d.fileId}`} target="_blank" className="btn btn-sm">Ver</a>}
                {!d.verified && (
                  <form action={deleteMyDocument.bind(null, d.id)}>
                    <button className="btn btn-sm btn-danger">Borrar</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        {privacy ? (
          <>
            <DocumentUploadForm action={uploadMyDocument} />
            <p className="text-xs text-stone-500">
              🔒 Protección de datos firmada el {formatDate(privacy.signedAt!.toISOString().slice(0, 10))} ·{" "}
              <a href={`/api/contracts/${privacy.id}/pdf`} target="_blank" className="underline">ver PDF</a>
            </p>
          </>
        ) : (
          <p className="text-sm text-stone-500">🔒 Para subir documentos, firma primero la protección de datos (arriba).</p>
        )}
      </section>

      {worker.loans.length > 0 && (
        <section className="space-y-2">
          <h2>Material que tienes de la empresa</h2>
          <ul className="card divide-y divide-stone-100 p-0 text-sm">
            {worker.loans.map((l) => (
              <li key={l.id} className="flex justify-between px-3 py-2">
                <span>{l.quantity > 1 && `${l.quantity} × `}{l.item}</span>
                <span className="text-stone-500">desde {formatDate(l.deliveredAt)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-500">Devuélvelo a RRHH cuando termines la temporada o si dejas de trabajar con nosotros.</p>
        </section>
      )}

      <form action={logout}>
        <button className="btn w-full">Cerrar sesión</button>
      </form>
    </div>
  );
}
