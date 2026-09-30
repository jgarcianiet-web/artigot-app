import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import { ClientForm } from "../ClientForm";

export default async function EditClient({ params }: { params: Promise<{ id: string }> }) {
  const client = await db.client.findUnique({
    where: { id: (await params).id },
    include: { events: { orderBy: { date: "desc" }, take: 30, select: { id: true, name: true, date: true } } },
  });
  if (!client) notFound();
  return (
    <div className="space-y-4">
      <h1>{client.name}</h1>
      <ClientForm client={client} />
      {client.events.length > 0 && (
        <section className="card max-w-2xl space-y-2">
          <h2>Eventos</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {client.events.map((e) => (
              <li key={e.id} className="flex justify-between py-1.5">
                <Link href={`/admin/eventos/${e.id}`} className="link">{e.name}</Link>
                <span className="text-stone-500">{formatDate(e.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
