import { deleteEventDoc, uploadEventDocs } from "@/app/actions";
import { ConfirmButton } from "@/components/client";
import { db } from "@/lib/db";
import { EventDocsForm } from "./EventDocsForm";

const when = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

/** Documentos del evento que solo ven RRHH, el maître y los camareros responsables (escaleta, plano de mesas, minuta…). */
export async function EventDocs({ eventId, leads }: { eventId: string; leads: string[] }) {
  const docs = await db.eventDoc.findMany({ where: { eventId }, include: { file: { select: { mime: true, size: true } } }, orderBy: { createdAt: "asc" } });
  return (
    <section id="documentos" className="card scroll-mt-4 space-y-3">
      <div>
        <h2>📄 Documentos para el maître y los responsables</h2>
        <p className="text-xs text-stone-500">
          Escaleta, plano de mesas, minuta, alergias… Solo los ven RRHH y el maître y los camareros responsables confirmados
          {leads.length ? ` (ahora: ${leads.join(", ")})` : " (aún no hay ninguno confirmado)"}, en el evento de su app. Al subirlos se les avisa.
        </p>
      </div>
      {docs.length > 0 && (
        <ul className="divide-y divide-stone-100 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                {d.file.mime === "application/pdf" ? "📄" : "🖼"} <a href={`/api/files/${d.fileId}`} target="_blank" className="link font-medium">{d.title}</a>
                <span className="text-xs text-stone-500"> · {Math.max(1, Math.round(d.file.size / 1024))} KB · {d.uploadedBy}, {when(d.createdAt)}</span>
              </span>
              <form action={deleteEventDoc.bind(null, d.id)}>
                <ConfirmButton className="btn btn-sm btn-danger" message={`¿Borrar «${d.title}»?`}>✕</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <EventDocsForm action={uploadEventDocs.bind(null, eventId)} />
    </section>
  );
}
