import Link from "next/link";
import { db } from "@/lib/db";

export default async function Settings() {
  const [venues, clients, templates, users] = await Promise.all([
    db.venue.count(),
    db.client.count(),
    db.eventTemplate.count(),
    db.adminUser.count({ where: { active: true } }),
  ]);
  const items = [
    { href: "/admin/fincas", title: "Fincas y lugares", text: "Dirección, punto de fichaje e indicaciones de acceso para el personal", n: venues },
    { href: "/admin/clientes", title: "Clientes", text: "Contacto y notas de cada cliente", n: clients },
    { href: "/admin/plantillas", title: "Plantillas de evento", text: "Personal, horario y notas habituales para crear eventos en segundos", n: templates },
    { href: "/admin/ajustes/uniforme", title: "Uniforme por puesto", text: "Lo que cada puesto debe llevar siempre (lista «Qué llevar» de la app)" },
    { href: "/admin/ajustes/empresa", title: "Empresa y contratos", text: "Razón social, CIF, documento de condiciones y cláusula de protección de datos que firma el personal" },
    { href: "/admin/ajustes/pagos", title: "Pagos y remesas", text: "Neto (Seguridad Social e IRPF), días de pago de cada quincena y cuenta para las remesas SEPA" },
    { href: "/admin/ajustes/a3", title: "Nóminas A3", text: "Códigos de empresa, concepto y trabajador para exportar las horas a A3" },
    { href: "/admin/tarifas", title: "Tarifas", text: "€/hora y mínimo de horas por puesto" },
    { href: "/admin/ajustes/copias", title: "Copias de seguridad y archivos", text: "Almacén de documentos, copia nocturna de la base de datos y descargas" },
    { href: "/admin/usuarios", title: "Usuarios de RRHH", text: "Quién puede entrar en la gestión", n: users },
  ];
  return (
    <div className="space-y-4">
      <h1>Ajustes</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="card block hover:border-brand-600">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{i.title}</span>
              {i.n !== undefined && <span className="rounded-full bg-stone-100 px-2 text-sm">{i.n}</span>}
            </div>
            <p className="mt-1 text-sm text-stone-500">{i.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
