import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { getCompany } from "./contracts";
import { db } from "./db";
import { ROLE_LABEL, type Role } from "./domain";
import { readStoredFile } from "./files";

/**
 * Documentos de Prevención de Riesgos Laborales (modelos de PREVINTEGRA). Cada trabajador los firma en la app y la app
 * rellena el PDF de la empresa con su nombre, DNI, puesto, empresa, fecha y firma, igual que se hacía a mano:
 *  - Anexo 1: entrega de documentación de PRL (art. 18 y 19 de la Ley 31/1995)
 *  - Anexo 2: entrega de EPIs (guantes de látex los camareros; guantes de carga los mozos)
 *  - Anexo 3: aceptación o renuncia al reconocimiento médico (lo elige al firmar)
 */

type Box = { x0: number; x1: number; y0: number; y1: number };
type Layout = { rows: { name: number; dni: number; role: number; company: number; date: number }; value: { x0: number; x1: number }; signature: Box };
// Posiciones en puntos sobre las plantillas (595 × 842), medidas en los PDF en blanco
const VALUE = { x0: 192, x1: 407 };
const SIG_X = { x0: 409, x1: 524 };

export const PRL_DOCS = [
  {
    kind: "PRL_ART",
    title: "Anexo 1 · Entrega de documentación de Prevención de Riesgos Laborales",
    file: "anexo1-art18-19.pdf",
    layout: { rows: { name: 309, dni: 286, role: 262, company: 239, date: 214 }, value: VALUE, signature: { ...SIG_X, y0: 209, y1: 300 } } as Layout,
  },
  {
    kind: "PRL_EPIS",
    title: "Anexo 2 · Entrega de Equipos de Protección Individual (EPI)",
    file: "anexo2-epis.pdf",
    layout: { rows: { name: 197, dni: 173, role: 150, company: 126, date: 103 }, value: VALUE, signature: { ...SIG_X, y0: 97, y1: 188 } } as Layout,
  },
  {
    kind: "PRL_RECONOCIMIENTO",
    title: "Anexo 3 · Aceptación o renuncia al reconocimiento médico",
    file: "anexo3-reconocimiento.pdf",
    layout: { rows: { name: 277, dni: 254, role: 230, company: 207, date: 182 }, value: VALUE, signature: { ...SIG_X, y0: 177, y1: 268 } } as Layout,
  },
] as const;

export type PrlKind = (typeof PRL_DOCS)[number]["kind"];
export const isPrl = (kind: string): kind is PrlKind => PRL_DOCS.some((d) => d.kind === kind);

/** EPI que se entrega según el puesto. */
export const epiFor = (role: string) => (role === "MOZO" ? "Guantes de carga" : "Guantes de látex");

function bodyFor(kind: PrlKind, role: string) {
  if (kind === "PRL_ART")
    return [
      "En virtud de lo establecido en el artículo 18 y 19 de la Ley 31/1995, de 8 de noviembre, de Prevención de Riesgos Laborales, el/la trabajador/a abajo firmante declara haber recibido y conocer en materia de Prevención de Riesgos Laborales la siguiente información:",
      "",
      "• Política de la empresa en Prevención de Riesgos Laborales.",
      "• Obligaciones y derechos en materia preventiva.",
      "• Información del puesto de trabajo conforme al artículo 18 de la LPRL. Evaluación de su puesto de trabajo.",
      "• Estructura y organización preventiva de la empresa, organizada a través de un Servicio de Prevención Ajeno PREVINTEGRA y con el siguiente interlocutor/a en la empresa para la comunicación de riesgos y accidentes de trabajo: JESÚS GARCÍA.",
      "• Tener a su disposición las fichas técnicas, instrucciones y manuales de uso de maquinaria, y fichas de seguridad de los productos químicos.",
      "• Normas de actuación en caso de emergencia y primeros auxilios.",
      "• Manual y Test de Formación específica para su puesto de trabajo, conforme al art. 19 LPRL.",
    ].join("\n");
  if (kind === "PRL_EPIS")
    return [
      "En cumplimiento del R.D. 773/1997, sobre disposiciones mínimas de seguridad y salud relativas a la utilización por los trabajadores de equipos de protección individual, el trabajador declara que:",
      "",
      "- Ha recibido y/o tiene a su disposición los Equipos de Protección Individual indicados a continuación.",
      "- Ha sido debidamente instruido sobre el manejo, limpieza y conservación del mencionado equipo, considerándose suficientemente capacitado para su uso. Aceptando el compromiso de:",
      "  · Utilizar este equipo durante la jornada de trabajo en las áreas o tareas cuya obligatoriedad de uso se encuentra establecida.",
      "  · Consultar cualquier duda sobre su correcta utilización, cuidando de su perfecto estado y conservación.",
      "",
      "Además, se obliga a informar a la dirección de la empresa de cualquier necesidad de uso de otros equipos de protección individual que pudieran ser necesarios, defectos, anomalías o daños que pueda sufrir el equipo, cumpliendo lo establecido en el art. 29 de la Ley de Prevención de Riesgos Laborales. Quedando advertido expresamente la obligatoriedad de su uso, para proteger su seguridad y salud.",
      "",
      `Equipo que se entrega: ${epiFor(role)}.`,
    ].join("\n");
  return [
    "El/la trabajador/a que suscribe la presente ha sido informado/a, conforme al artículo 22 de la Ley 31/1995 de Prevención de riesgos laborales, del derecho a la vigilancia de la salud en relación a los riesgos que pudieran derivarse de la actividad laboral que desarrolla para la empresa, y la posibilidad de someterme a un reconocimiento médico para prevenir dichos riesgos, así como la determinación de las medidas de protección necesarias para evitarlos o minimizarlos.",
    "",
    "El Servicio de Prevención PREVINTEGRA Servicios Integrales en Seguridad y Salud Laboral garantiza, contando al efecto con las oportunas medidas de seguridad, la confidencialidad de todos los datos (médicos y personales) que le sean facilitados por el/la trabajador/a aquí firmante, de acuerdo con lo previsto en la normativa de Protección de Datos vigente (Reglamento (UE) 2016/679 y Ley Orgánica 3/2018).",
    "",
    "Al firmar, indica si DESEA o NO DESEA pasar el reconocimiento médico.",
  ].join("\n");
}

/** Crea los documentos de PRL que le falten al trabajador (sin firmar). Devuelve los pendientes. */
export async function ensurePrlDocs(w: { id: string; role: string }) {
  const have = await db.contract.findMany({ where: { workerId: w.id, kind: { in: PRL_DOCS.map((d) => d.kind) } }, select: { kind: true } });
  for (const d of PRL_DOCS) {
    if (have.some((h) => h.kind === d.kind)) continue;
    await db.contract.create({ data: { kind: d.kind, workerId: w.id, title: d.title, body: bodyFor(d.kind, w.role), createdBy: "Automático", data: { role: w.role } } });
  }
}

/** Estado de los documentos de PRL de un trabajador (para su ficha). */
export async function prlStatus(workerId: string) {
  const docs = await db.contract.findMany({
    where: { workerId, kind: { in: PRL_DOCS.map((d) => d.kind) } },
    select: { id: true, kind: true, title: true, signedAt: true, data: true },
    orderBy: { createdAt: "desc" },
  });
  return PRL_DOCS.map((d) => ({ ...d, doc: docs.find((x) => x.kind === d.kind) ?? null }));
}

const ddmmyyyy = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** PDF del documento: la plantilla de la empresa con los datos del trabajador (y su firma, si ya ha firmado). */
export async function prlPdf(contractId: string) {
  const c = await db.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { worker: { select: { name: true, dni: true, role: true } }, signature: { select: { data: true, storageKey: true } } },
  });
  const def = PRL_DOCS.find((d) => d.kind === c.kind)!;
  const pdf = await PDFDocument.load(await readFile(path.join(process.cwd(), "templates", "prl", def.file)));
  pdf.setTitle(`${c.title} · ${c.worker.name}`);
  const page = pdf.getPage(0);
  // Las plantillas traen anotaciones encima («guantes de latex», la X de «NO DESEO»): se quitan y se ponen las de cada uno
  page.node.delete(PDFName.of("Annots"));
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const data = (c.data ?? {}) as { role?: string; choice?: "SI" | "NO" };
  const role = data.role ?? c.worker.role;
  const company = (await getCompany()).name || "Artigot Catering SL";
  const date = c.signedAt ? ddmmyyyy(c.signedAt) : "";
  const L = def.layout;
  const center = (text: string, y: number, size = 11) => {
    if (!text) return;
    let s = size;
    while (s > 7 && bold.widthOfTextAtSize(text, s) > L.value.x1 - L.value.x0 - 8) s -= 0.5;
    const w = bold.widthOfTextAtSize(text, s);
    page.drawText(text, { x: (L.value.x0 + L.value.x1 - w) / 2, y, size: s, font: bold, color: rgb(0, 0, 0) });
  };
  center(c.worker.name.toLocaleUpperCase("es-ES"), L.rows.name);
  center(c.worker.dni ?? "", L.rows.dni);
  center((ROLE_LABEL[role as Role] ?? role).toLocaleUpperCase("es-ES"), L.rows.role);
  center(company.toLocaleUpperCase("es-ES"), L.rows.company);
  center(date, L.rows.date);
  const sigPng = c.signature && c.signedAt ? await pdf.embedPng(await readStoredFile(c.signature)) : null;
  const drawSig = (b: Box) => {
    if (!sigPng) return;
    const scale = Math.min((b.x1 - b.x0 - 6) / sigPng.width, (b.y1 - b.y0 - 6) / sigPng.height);
    const [w, h] = [sigPng.width * scale, sigPng.height * scale];
    page.drawImage(sigPng, { x: (b.x0 + b.x1 - w) / 2, y: (b.y0 + b.y1 - h) / 2, width: w, height: h });
  };
  drawSig(L.signature);
  if (c.kind === "PRL_EPIS") {
    // Primera fila de la tabla de equipos: equipo, cantidad, fecha y firma
    page.drawText(epiFor(role).toLowerCase(), { x: 86, y: 410, size: 11, font: bold });
    page.drawText("1", { x: 373, y: 410, size: 11, font: bold });
    if (date) page.drawText(date, { x: 411, y: 410, size: 8.5, font: bold });
    drawSig({ x0: 466, x1: 534, y0: 393, y1: 422 });
  }
  // Casilla «NO DESEO» o «SI DESEO»
  if (c.kind === "PRL_RECONOCIMIENTO" && data.choice) page.drawText("X", { x: 137.6, y: data.choice === "NO" ? 539.3 : 516.2, size: 9.5, font: bold });
  return pdf.save();
}
