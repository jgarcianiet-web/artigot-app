import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { after } from "next/server";
import { db } from "./db";
import { callTime, euro, formatDate, ROLE_LABEL, type Role } from "./domain";
import { notify } from "./push";

/**
 * Documento de condiciones del servicio que firma cada trabajador confirmado.
 * El texto sale de una plantilla editable (Ajustes → Empresa y contratos) con marcadores {{…}}
 * y se congela al generarlo. La firma es una firma electrónica simple: trazo en el móvil + fecha,
 * hora e IP. El texto por defecto es orientativo: debe revisarlo vuestra asesoría laboral.
 */

export type Company = { name: string; cif: string; address: string; city: string; agreement: string; template: string };

export const DEFAULT_TEMPLATE = `En {{ciudad}}, a {{hoy}}.

REUNIDOS

De una parte, {{empresa}}, con CIF {{cif}} y domicilio en {{domicilio}} (en adelante, la empresa).

De otra parte, {{trabajador}}, con DNI/NIE {{dni}} y número de afiliación a la Seguridad Social {{nss}} (en adelante, el trabajador o la trabajadora).

CONDICIONES DEL SERVICIO

1. Servicio. La persona trabajadora prestará servicios como {{puesto}} en el evento «{{evento}}», que se celebrará el {{fecha}} en {{lugar}}.

2. Horario. Hora de citación: {{citacion}}. Hora prevista de finalización: {{fin}}. Las horas efectivas se computarán según el registro de jornada (fichaje) del propio evento.

3. Retribución. {{tarifa}} por hora trabajada, con un mínimo de {{minimo}} horas por servicio, en los términos del convenio colectivo aplicable ({{convenio}}). El pago se realizará en la nómina del mes correspondiente.

4. Uniforme y normas. La persona trabajadora se compromete a acudir con el uniforme indicado por la empresa y a seguir las indicaciones del maître o responsable del evento.

5. Protección de datos. Los datos personales se tratarán únicamente para la gestión de la relación laboral, conforme al RGPD y a la LOPDGDD.

Ambas partes manifiestan su conformidad con las condiciones anteriores.`;

export async function getCompany(): Promise<Company> {
  const row = await db.setting.findUnique({ where: { key: "empresa" } });
  const v = (row?.value ?? {}) as Partial<Company>;
  return {
    name: v.name ?? "",
    cif: v.cif ?? "",
    address: v.address ?? "",
    city: v.city ?? "",
    agreement: v.agreement ?? "Convenio de hostelería de la provincia",
    template: v.template?.trim() ? v.template : DEFAULT_TEMPLATE,
  };
}

const todayLong = () =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric" }).format(new Date());

export function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => values[k] ?? `{{${k}}}`);
}

/** Genera el documento para cada confirmado que aún no lo tenga y les avisa para que lo firmen. */
export async function generateContracts(eventId: string, createdBy: string) {
  const [company, event, rates] = await Promise.all([
    getCompany(),
    db.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { assignments: { where: { status: "CONFIRMADO", contract: null }, include: { worker: true } } },
    }),
    db.rate.findMany(),
  ]);
  const missing: string[] = [];
  let created = 0;
  for (const a of event.assignments) {
    const w = a.worker;
    if (!w.dni || !w.nss) missing.push(w.name);
    const rate = rates.find((r) => r.role === a.role);
    const body = renderTemplate(company.template, {
      empresa: company.name || "[razón social]",
      cif: company.cif || "[CIF]",
      domicilio: company.address || "[domicilio]",
      ciudad: company.city || "[ciudad]",
      convenio: company.agreement,
      hoy: todayLong(),
      trabajador: w.name,
      dni: w.dni ?? "[pendiente]",
      nss: w.nss ?? "[pendiente]",
      puesto: ROLE_LABEL[a.role as Role]?.toLowerCase() ?? a.role,
      evento: event.name,
      fecha: formatDate(event.date, { long: true }),
      lugar: event.venue,
      citacion: callTime(event, a.role),
      fin: event.endTime ?? "según necesidades del servicio",
      tarifa: rate ? euro(rate.hourlyRate) : "[tarifa]",
      minimo: rate ? String(rate.minHours).replace(".", ",") : "0",
    });
    await db.contract.create({
      data: { assignmentId: a.id, workerId: w.id, eventId, title: `Condiciones del servicio · ${event.name}`, body, createdBy },
    });
    created++;
  }
  if (created) {
    const ids = event.assignments.map((a) => a.workerId);
    after(() =>
      notify({
        workerIds: ids,
        workerUrl: "/app",
        title: "Documento para firmar",
        body: `Tienes que firmar las condiciones del servicio de ${event.name}. Solo te llevará un momento.`,
        tag: `contrato-${eventId}`,
      }),
    );
  }
  return { created, missing };
}

// ---------- PDF ----------

/** Quita los caracteres que la fuente estándar del PDF no puede dibujar (emojis, etc.). */
const pdfSafe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€‘’“”–—…\n]/g, "");

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, width: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function contractPdf(contractId: string) {
  const c = await db.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { worker: { select: { name: true, dni: true } }, signature: { select: { data: true } } },
  });
  const company = await getCompany();
  const pdf = await PDFDocument.create();
  pdf.setTitle(c.title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H, M] = [595, 842, 56];
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const newPageIfNeeded = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  page.drawText(pdfSafe(company.name || "Artigot"), { x: M, y, size: 10, font: bold, color: rgb(0.35, 0.25, 0.84) });
  y -= 28;
  for (const l of wrap(pdfSafe(c.title), bold, 15, W - 2 * M)) {
    page.drawText(l, { x: M, y, size: 15, font: bold });
    y -= 20;
  }
  y -= 8;
  for (const l of wrap(pdfSafe(c.body), font, 10.5, W - 2 * M)) {
    newPageIfNeeded(16);
    const heading = /^[A-ZÁÉÍÓÚÑ ]{5,}$/.test(l.trim());
    page.drawText(l, { x: M, y, size: 10.5, font: heading ? bold : font });
    y -= l ? 15 : 9;
  }
  newPageIfNeeded(150);
  y -= 24;
  page.drawText("Firma de la persona trabajadora:", { x: M, y, size: 10, font: bold });
  y -= 8;
  if (c.signature && c.signedAt) {
    const img = await pdf.embedPng(c.signature.data);
    const scale = Math.min(200 / img.width, 80 / img.height);
    page.drawImage(img, { x: M, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
    y -= img.height * scale + 16;
    const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "medium" }).format(c.signedAt);
    for (const l of wrap(
      pdfSafe(`Firmado electrónicamente por ${c.signerName ?? c.worker.name}${c.worker.dni ? ` (${c.worker.dni})` : ""} el ${when} desde la app de Artigot (IP ${c.signerIp ?? "desconocida"}). Documento ${c.id}.`),
      font,
      8.5,
      W - 2 * M,
    )) {
      page.drawText(l, { x: M, y, size: 8.5, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 11;
    }
  } else {
    y -= 60;
    page.drawText("Pendiente de firma", { x: M, y, size: 10, font, color: rgb(0.7, 0.4, 0) });
  }
  return pdf.save();
}
