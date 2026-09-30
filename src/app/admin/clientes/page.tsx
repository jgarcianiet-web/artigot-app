import Link from "next/link";
import { deleteClient } from "@/app/actions";
import { ConfirmButton } from "@/components/client";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";

export default async function Clients() {
  const clients = await db.client.findMany({ include: { _count: { select: { events: true } } }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/admin/ajustes" className="text-sm text-stone-500 hover:underline">‹ Ajustes</Link>
          <h1>Clientes</h1>
        </div>
        <Link href="/admin/clientes/nuevo" className="btn btn-primary">+ Nuevo cliente</Link>
      </div>
      {clients.length === 0 ? (
        <Empty>No hay clientes guardados. También puedes guardarlos al crear un evento.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contacto</th>
                <th className="text-right">Eventos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/admin/clientes/${c.id}`} className="link">{c.name}</Link></td>
                  <td className="text-sm">
                    {c.contact}
                    {c.phone && <div><a href={`tel:${c.phone}`}>{c.phone}</a></div>}
                    {c.email && <div className="text-stone-500">{c.email}</div>}
                  </td>
                  <td className="text-right">{c._count.events}</td>
                  <td className="text-right">
                    <form action={deleteClient.bind(null, c.id)}>
                      <ConfirmButton className="btn btn-sm btn-danger" message="¿Eliminar este cliente? Los eventos no se borran.">Eliminar</ConfirmButton>
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
