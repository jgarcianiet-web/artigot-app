import Link from "next/link";
import { deleteVenue } from "@/app/actions";
import { ConfirmButton } from "@/components/client";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";

export default async function Venues() {
  const venues = await db.venue.findMany({ include: { _count: { select: { events: true } } }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
          <h1>Fincas y lugares</h1>
        </div>
        <Link href="/admin/fincas/nueva" className="btn btn-primary">+ Nueva finca</Link>
      </div>
      {venues.length === 0 ? (
        <Empty>No hay fincas guardadas. También puedes guardarlas al crear un evento.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Finca</th>
                <th>Contacto</th>
                <th>Fichaje</th>
                <th className="text-right">Eventos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/admin/fincas/${v.id}`} className="link">{v.name}</Link>
                    {v.address && <div className="text-xs text-stone-500">{v.address}</div>}
                  </td>
                  <td className="text-sm">
                    {v.contactName}
                    {v.contactPhone && <div><a href={`tel:${v.contactPhone}`}>{v.contactPhone}</a></div>}
                  </td>
                  <td className="text-sm">{v.lat != null ? "📍 Punto fijado" : <span className="text-amber-700">Sin punto</span>}</td>
                  <td className="text-right">{v._count.events}</td>
                  <td className="text-right">
                    <form action={deleteVenue.bind(null, v.id)}>
                      <ConfirmButton className="btn btn-sm btn-danger" message="¿Eliminar esta finca? Los eventos no se borran.">Eliminar</ConfirmButton>
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
