import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage } from "pdf-lib";
import { db } from "./db";
import { readStoredFile } from "./files";

/**
 * Exporta en PDF la conversación de RRHH con un trabajador o un grupo con el personal (para guardarla o entregarla):
 * todos los mensajes con fecha, hora y quién lo escribió, y las fotos dentro del documento.
 */

const TZ = "Europe/Madrid";
const when = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

// Helvetica estándar solo tiene Latin-1: los emojis y otros símbolos se quitan
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€‘’“”–—…\n]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      let w = word;
      // Palabras más largas que la línea (enlaces…): se cortan
      while (font.widthOfTextAtSize(w, size) > width) {
        let i = w.length - 1;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        if (line) lines.push(line), (line = "");
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) lines.push(line), (line = w);
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

type PdfMessage = { createdAt: Date; who: string; staff: boolean; body: string; fileId: string | null };

export async function workerChatPdf(workerId: string, exportedBy: string) {
  const worker = await db.worker.findUniqueOrThrow({ where: { id: workerId }, select: { name: true, dni: true, a3Code: true } });
  const messages = await db.workerMessage.findMany({ where: { workerId }, orderBy: { createdAt: "asc" } });
  const ids = [worker.dni && `DNI/NIE ${worker.dni}`, worker.a3Code && `Código A3 ${worker.a3Code}`].filter(Boolean).join(" · ");
  const bytes = await chatPdf(
    `Conversación de RRHH con ${worker.name}`,
    ids ? [ids] : [],
    exportedBy,
    messages.map((m) => ({ createdAt: m.createdAt, who: m.fromWorker ? m.authorName : `${m.authorName} (RRHH)`, staff: !m.fromWorker, body: m.body, fileId: m.fileId })),
  );
  return { bytes, name: worker.name };
}

/** PDF de un grupo con el personal: miembros y todos los mensajes. */
export async function groupChatPdf(groupId: string, exportedBy: string) {
  const g = await db.workerGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: { include: { worker: { select: { name: true } } }, orderBy: { worker: { name: "asc" } } } },
  });
  const messages = await db.groupMessage.findMany({ where: { groupId }, orderBy: { createdAt: "asc" } });
  const bytes = await chatPdf(
    `Grupo «${g.name}»`,
    [`${g.members.length} personas: ${g.members.map((m) => m.worker.name).join(", ")}`],
    exportedBy,
    messages.map((m) => ({ createdAt: m.createdAt, who: m.workerId ? m.authorName : `${m.authorName} (RRHH)`, staff: !m.workerId, body: m.body, fileId: m.fileId })),
  );
  return { bytes, name: g.name };
}

async function chatPdf(title: string, info: string[], exportedBy: string, messages: PdfMessage[]) {
  const files = new Map(
    (await db.storedFile.findMany({ where: { id: { in: messages.flatMap((m) => (m.fileId ? [m.fileId] : [])) } }, select: { id: true, mime: true, data: true, storageKey: true } })).map((f) => [f.id, f]),
  );

  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(title));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H, M] = [595.28, 841.89, 50];
  const width = W - 2 * M;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (s: string, f: PDFFont, size: number, x = M, color = rgb(0.1, 0.1, 0.1)) => {
    ensure(size + 4);
    page.drawText(s, { x, y: y - size, size, font: f, color });
    y -= size + 4;
  };

  text(safe(title), bold, 15);
  for (const line of info.flatMap((i) => wrap(i, font, 10, width))) text(line, font, 10, M, rgb(0.35, 0.35, 0.35));
  const span = messages.length ? ` · del ${when(messages[0].createdAt)} al ${when(messages[messages.length - 1].createdAt)}` : "";
  text(safe(`${messages.length} mensajes${span}`), font, 10, M, rgb(0.35, 0.35, 0.35));
  text(safe(`Exportado el ${when(new Date())} por ${exportedBy}`), font, 10, M, rgb(0.35, 0.35, 0.35));
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 12;

  if (!messages.length) text("No hay mensajes.", font, 11);
  for (const m of messages) {
    ensure(30);
    text(safe(`${when(m.createdAt)} · ${m.who}`), bold, 9, M, m.staff ? rgb(0.05, 0.45, 0.3) : rgb(0.1, 0.35, 0.6));
    for (const line of wrap(m.body, font, 11, width - 10)) text(line, font, 11, M + 10);
    if (m.fileId) {
      const f = files.get(m.fileId);
      let img: PDFImage | null = null;
      try {
        if (f?.mime === "image/jpeg") img = await pdf.embedJpg(await readStoredFile(f));
        else if (f?.mime === "image/png") img = await pdf.embedPng(await readStoredFile(f));
      } catch (e) {
        console.error("foto del chat en PDF", m.fileId, e);
      }
      if (img) {
        const s = Math.min(1, 220 / img.width, 220 / img.height);
        const [iw, ih] = [img.width * s, img.height * s];
        ensure(ih + 6);
        page.drawImage(img, { x: M + 10, y: y - ih, width: iw, height: ih });
        y -= ih + 6;
      } else text(f ? "[Foto en un formato que no se puede incluir en el PDF]" : "[Foto borrada]", font, 10, M + 10, rgb(0.45, 0.45, 0.45));
    }
    y -= 8;
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Página ${i + 1} de ${pages.length}`, { x: W - M - 70, y: 25, size: 8, font, color: rgb(0.5, 0.5, 0.5) }),
  );
  return pdf.save();
}
