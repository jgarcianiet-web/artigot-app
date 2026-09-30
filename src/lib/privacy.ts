import { db } from "./db";
import { getCompany, renderTemplate } from "./contracts";

/**
 * Cláusula de protección de datos (RGPD) que el trabajador firma en la app antes de subir su
 * documentación. Se firma una vez; si RRHH publica una versión nueva del texto, hay que volver a firmar.
 * El texto por defecto es orientativo: debe revisarlo vuestra asesoría o delegado de protección de datos.
 */

export const PRIVACY_TITLE = "Protección de datos personales";

export const DEFAULT_PRIVACY_TEMPLATE = `En {{ciudad}}, a {{hoy}}.

INFORMACIÓN SOBRE PROTECCIÓN DE DATOS

Yo, {{trabajador}}, con DNI/NIE {{dni}}, declaro haber sido informado/a de lo siguiente:

1. Responsable. {{empresa}}, con CIF {{cif}} y domicilio en {{domicilio}}. Contacto para protección de datos: {{email_privacidad}}.

2. Datos que se tratan. Datos identificativos y de contacto, DNI/NIE, número de la Seguridad Social, cuenta bancaria, fecha de nacimiento, dirección, documentación que aporte (DNI, tarjeta sanitaria, carnet de manipulador de alimentos, certificados…), registro de jornada con la ubicación en el momento de fichar, valoraciones del servicio y mensajes del chat de los eventos.

3. Finalidad. Gestionar la relación laboral: convocatorias a eventos, altas y bajas en la Seguridad Social, nóminas y pagos, registro de jornada, prevención de riesgos laborales y comunicación con el personal.

4. Legitimación. La ejecución del contrato de trabajo y el cumplimiento de obligaciones legales (Estatuto de los Trabajadores, Ley General de la Seguridad Social, normativa tributaria y de registro de jornada).

5. Destinatarios. Tesorería General de la Seguridad Social, Agencia Tributaria, mutua, entidades bancarias para el pago de las nóminas, la asesoría laboral y los proveedores tecnológicos de la aplicación, con los que existe contrato de encargo de tratamiento. No se hacen transferencias internacionales de datos.

6. Conservación. Mientras dure la relación laboral y, después, durante los plazos legales (4 años para la documentación laboral y de Seguridad Social y el registro de jornada; 6 años para la documentación contable y fiscal).

7. Derechos. Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad escribiendo a {{email_privacidad}}, y reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).

8. Compromiso. Me comprometo a comunicar cualquier cambio en mis datos y a guardar confidencialidad sobre los datos personales de clientes, invitados y compañeros a los que tenga acceso por mi trabajo.

Con mi firma confirmo que he leído y entendido esta información.`;

export type PrivacySettings = { email: string; template: string; version: number };

export async function getPrivacy(): Promise<PrivacySettings> {
  const row = await db.setting.findUnique({ where: { key: "privacidad" } });
  const v = (row?.value ?? {}) as Partial<PrivacySettings>;
  return {
    email: v.email ?? "",
    template: v.template?.trim() ? v.template : DEFAULT_PRIVACY_TEMPLATE,
    version: v.version ?? 1,
  };
}

/** Firma vigente (de la versión actual del texto), si la hay. */
export async function privacySignature(workerId: string) {
  const { version } = await getPrivacy();
  return db.contract.findFirst({
    where: { workerId, kind: "RGPD", version, signedAt: { not: null } },
    orderBy: { signedAt: "desc" },
    select: { id: true, signedAt: true },
  });
}

/** Documento pendiente de firma de la versión actual; lo crea si no existe. */
export async function ensurePrivacyDoc(workerId: string) {
  const [privacy, company, worker] = await Promise.all([
    getPrivacy(),
    getCompany(),
    db.worker.findUniqueOrThrow({ where: { id: workerId }, select: { name: true, dni: true } }),
  ]);
  const body = renderTemplate(privacy.template, {
    empresa: company.name || "[razón social]",
    cif: company.cif || "[CIF]",
    domicilio: company.address || "[domicilio]",
    ciudad: company.city || "[ciudad]",
    email_privacidad: privacy.email || "[email de contacto]",
    hoy: new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    trabajador: worker.name,
    dni: worker.dni ?? "[pendiente]",
  });
  // Si ya había uno sin firmar, se actualiza el texto (p. ej. si después ha añadido su DNI)
  const pending = await db.contract.findFirst({ where: { workerId, kind: "RGPD", version: privacy.version, signedAt: null } });
  if (pending) return db.contract.update({ where: { id: pending.id }, data: { body } });
  return db.contract.create({
    data: { kind: "RGPD", version: privacy.version, workerId, title: PRIVACY_TITLE, body, createdBy: "App" },
  });
}
