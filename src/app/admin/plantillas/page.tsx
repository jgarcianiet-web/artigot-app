import Link from "next/link";
import { deleteTemplate } from "@/app/actions";
import { ConfirmButton } from "@/components/client";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { EVENT_TYPE_LABEL } from "@/lib/domain";

export default async function Templates() {
  const templates = await db.eventTemplate.findMany({ include: { venue: { select: { name: true } } }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
        <h1>Plantillas de evento</h1>
        <p className="text-sm text-stone-500">Se crean desde cualquier evento con «Guardar como plantilla» y se usan al crear un evento nuevo.</p>
      </div>
      {templates.length === 0 ? (
        <Empty>Todavía no hay plantillas. Abre un evento y pulsa «Guardar como plantilla».</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Plantilla</th>
                <th>Horario</th>
                <th>Personal</th>
                <th>Finca</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">
                    {t.name}
                    <div className="text-xs text-stone-500">{EVENT_TYPE_LABEL[t.type]}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    {t.startTime}–{t.endTime}
                    {t.unloadTime && <div className="text-xs text-stone-500">descarga {t.unloadTime}</div>}
                  </td>
                  <td className="text-sm">
                    {[
                      t.needCamareros && `${t.needCamareros} camareros`,
                      t.needResponsables && `${t.needResponsables} responsables`,
                      t.needMaitres && `${t.needMaitres} maîtres`,
                      t.needMozos && `${t.needMozos} mozos`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </td>
                  <td className="text-stone-500">{t.venue?.name}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/admin/eventos/nuevo?plantilla=${t.id}`} className="btn btn-sm btn-primary">Crear evento</Link>{" "}
                    <form action={deleteTemplate.bind(null, t.id)} className="inline">
                      <ConfirmButton className="btn btn-sm btn-danger" message="¿Eliminar esta plantilla?">Eliminar</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
