import Link from "next/link";
import { markPushAsked } from "@/app/actions";
import { Empty } from "@/components/ui";
import { db } from "@/lib/db";
import { appUrl, formatDate } from "@/lib/domain";
import { waLink } from "@/lib/whatsapp";
import { AskButton } from "./AskButton";

/** Pedir de golpe por WhatsApp que activen los avisos a quien no los tiene en ningún móvil. */
export default async function AskPush() {
  const workers = await db.worker.findMany({
    where: { active: true, devices: { none: {} } },
    select: { id: true, name: true, phone: true, accessCode: true, pushAskedAt: true, zone: true },
    orderBy: [{ pushAskedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  const total = await db.worker.count({ where: { active: true } });
  const asked = workers.filter((w) => w.pushAskedAt).length;
  const text = (name: string, phone: string | null, code: string) =>
    [
      `Hola ${name.split(" ")[0]}, para enterarte al momento de las convocatorias de Artigot activa los avisos de la app:`,
      `1. Abre ${appUrl()}/app y entra con tu ${phone ? "teléfono" : "email"} y tu código ${code}.`,
      "2. Añádela a la pantalla de inicio: en iPhone, Compartir → «Añadir a pantalla de inicio»; en Android, menú ⋮ → «Instalar app» o «Añadir a pantalla de inicio».",
      "3. Ábrela desde ese icono, ve a Perfil → «Avisos en este móvil» y pulsa «Activar avisos» y luego «Enviarme un aviso de prueba».",
      "¡Gracias!",
    ].join("\n");
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/admin/personal" className="text-sm text-stone-500 hover:underline">‹ Personal</Link>
      <h1>Pedir que activen los avisos</h1>
      <p className="text-sm text-stone-600">
        {workers.length} de {total} personas no tienen los avisos activados en ningún móvil (no se enteran de las convocatorias). Pulsa «WhatsApp» en cada una: se abre la
        conversación con las instrucciones ya escritas y solo tienes que enviar. Quien los active desaparece solo de esta lista.
      </p>
      {workers.length > 0 && <p className="text-sm text-stone-500">Ya pedido a {asked}; sin pedir, {workers.length - asked}.</p>}
      {workers.length === 0 ? (
        <Empty>Todo el personal tiene los avisos activados.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table text-sm">
            <thead><tr><th>Persona</th><th>Teléfono</th><th>Pedido</th><th /></tr></thead>
            <tbody>
              {workers.map((w) => {
                const wa = waLink(w.phone, text(w.name, w.phone, w.accessCode));
                return (
                  <tr key={w.id}>
                    <td><Link href={`/admin/personal/${w.id}`} className="link">{w.name}</Link>{w.zone && <div className="text-xs text-stone-500">{w.zone}</div>}</td>
                    <td className="whitespace-nowrap">{w.phone ?? <span className="text-stone-400">sin teléfono</span>}</td>
                    <td className="whitespace-nowrap text-xs text-stone-500">{w.pushAskedAt ? formatDate(w.pushAskedAt.toISOString().slice(0, 10)) : "—"}</td>
                    <td className="text-right">{wa && <AskButton href={wa} action={markPushAsked.bind(null, w.id)} again={!!w.pushAskedAt} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
