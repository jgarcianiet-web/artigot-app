import { createHash } from "node:crypto";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { getCompany } from "./contracts";

/** PDF firmado: el original con «Firmado electrónicamente por…» en cada página y una hoja final con los datos de la firma. */

const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€‘’“”–—…\n]/g, "");
const when = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(d);

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) out.push(line), (line = word);
      else line = next;
    }
    out.push(line);
  }
  return out;
}

export type SignedInfo = {
  id: string;
  title: string;
  name: string;
  dni: string | null;
  signedAt: Date;
  ip: string | null;
  note: string | null;
  sentBy: string;
  sentAt: Date;
  signature: Buffer | null;
  /** Filas de más en la hoja de firma (p. ej. el email verificado de una persona externa) */
  extra?: [string, string][];
  /** Cómo se identificó y firmó, para el texto final */
  how: string;
};

export async function stampSignedPdf(original: Buffer, i: SignedInfo) {
  const hash = createHash("sha256").update(original).digest("hex");
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.35, 0.35, 0.35);
  const stamp = safe(`Firmado electrónicamente por ${i.name}${i.dni ? ` (${i.dni})` : ""} el ${when(i.signedAt)} · ref. ${i.id}`);
  for (const page of pdf.getPages()) {
    const { width } = page.getSize();
    let size = 7;
    while (size > 5 && font.widthOfTextAtSize(stamp, size) > width - 40) size -= 0.5;
    page.drawText(stamp, { x: 20, y: 12, size, font, color: grey });
  }
  // Hoja de firma
  const [W, H, M] = [595, 842, 56];
  const page = pdf.addPage([W, H]);
  let y = H - M;
  const line = (text: string, f = font, size = 10.5, color = rgb(0.1, 0.1, 0.1)) => {
    for (const l of wrap(text, f, size, W - 2 * M)) {
      page.drawText(l, { x: M, y, size, font: f, color });
      y -= size + 5;
    }
  };
  const company = await getCompany();
  line("Hoja de firma electrónica", bold, 16);
  y -= 6;
  line(i.title, bold, 12);
  line(`Empresa: ${company.name || "Artigot Catering"}${company.cif ? ` · CIF ${company.cif}` : ""}`, font, 10, grey);
  y -= 10;
  const rows: [string, string][] = [
    ["Firmante", i.name],
    ["DNI / NIE", i.dni ?? "—"],
    ...(i.extra ?? []),
    ["Fecha y hora de la firma", `${when(i.signedAt)} (hora de Madrid)`],
    ["Dirección IP", i.ip ?? "—"],
    ["Enviado por", `${i.sentBy} (RRHH) el ${when(i.sentAt)}`],
    ["Referencia", i.id],
    ["Huella SHA-256 del documento original", hash],
  ];
  for (const [k, v] of rows) {
    line(k, bold, 9.5, grey);
    line(v, font, k.startsWith("Huella") ? 8.5 : 11);
    y -= 4;
  }
  if (i.note) {
    line("Observaciones del firmante", bold, 9.5, grey);
    line(i.note, font, 11);
    y -= 4;
  }
  y -= 8;
  line("Firma", bold, 9.5, grey);
  if (i.signature) {
    const sig = await pdf.embedPng(i.signature);
    const scale = Math.min(240 / sig.width, 110 / sig.height);
    const [w, h] = [sig.width * scale, sig.height * scale];
    page.drawRectangle({ x: M, y: y - h - 8, width: 260, height: h + 16, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.8 });
    page.drawImage(sig, { x: M + 10, y: y - h, width: w, height: h });
    y -= h + 30;
  }
  line(
    `El firmante declaró haber leído el documento y estar conforme, y ${i.how}. La huella SHA-256 permite comprobar que el documento firmado es exactamente el que se le envió.`,
    font,
    9,
    grey,
  );
  pdf.setTitle(safe(`${i.title} · ${i.name} · firmado`));
  return pdf.save();
}
