import { PDFDocument } from "pdf-lib";
import { db } from "./db";
import { deleteStoredFile, storePayslipFile } from "./files";
import { later } from "./later";
import { notify } from "./push";

/**
 * Reparto de las nóminas que calcula A3: RRHH sube el PDF con todas las nóminas del mes y la app lo separa por
 * DNI/NIE. Cada trabajador recibe sus páginas en un solo PDF (todas sus nóminas del mes) y se lee el
 * «líquido a percibir» de cada una para cuadrarlo con lo que calculó la app.
 */

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

const DNI = /\b([XYZ]\d{7}|\d{8})[- ]?([A-Z])\b/g;
const LIQUIDO = /L[ÍI]QUIDO\s+(?:TOTAL\s+)?A\s+PERCIBIR\D{0,40}?(-?\d{1,3}(?:\.\d{3})*,\d{2})/i;
const normDni = (v: string) => v.toUpperCase().replace(/[\s-]/g, "");
const amount = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));

/** Texto de cada página del PDF. */
async function pageTexts(data: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: data.slice(), useSystemFonts: false });
  const pdf = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out.push(tc.items.map((x) => ("str" in x ? x.str : "")).join(" ").replace(/\s+/g, " "));
  }
  await task.destroy();
  return out;
}

export type SplitResult = {
  pages: number;
  workers: number;
  /** Páginas sin un DNI de alguien de la plantilla */
  unknown: { page: number; dni: string | null }[];
};

export async function splitPayslips(file: Uint8Array, month: string, by: string): Promise<SplitResult> {
  const texts = await pageTexts(file);
  const workers = await db.worker.findMany({ where: { dni: { not: null } }, select: { id: true, dni: true } });
  const byDni = new Map(workers.map((w) => [normDni(w.dni!), w.id]));

  // Páginas de cada trabajador. Una página sin DNI (p. ej. la segunda hoja de una nómina) va con la anterior.
  const pagesOf = new Map<string, number[]>();
  const nets = new Map<string, number[]>();
  const unknown: SplitResult["unknown"] = [];
  let last: string | null = null;
  texts.forEach((t, i) => {
    const found = [...t.toUpperCase().matchAll(DNI)].map((m) => `${m[1]}${m[2]}`);
    const known = found.map((d) => byDni.get(d)).find(Boolean) ?? null;
    const who = known ?? (found.length ? null : last);
    if (!who) {
      unknown.push({ page: i + 1, dni: found[0] ?? null });
      last = null;
      return;
    }
    last = who;
    pagesOf.set(who, [...(pagesOf.get(who) ?? []), i]);
    const liq = t.match(LIQUIDO);
    if (liq) nets.set(who, [...(nets.get(who) ?? []), amount(liq[1])]);
  });

  const source = await PDFDocument.load(file, { ignoreEncryption: true });
  for (const [workerId, pages] of pagesOf) {
    const out = await PDFDocument.create();
    for (const p of await out.copyPages(source, pages)) out.addPage(p);
    const stored = await storePayslipFile(Buffer.from(await out.save()), workerId);
    const list = nets.get(workerId);
    const net = list?.length ? Math.round(list.reduce((a, b) => a + b, 0) * 100) / 100 : null;
    const before = await db.payslip.findUnique({ where: { workerId_month: { workerId, month } } });
    await db.payslip.upsert({
      where: { workerId_month: { workerId, month } },
      create: { workerId, month, fileId: stored.id, pages: pages.length, net, createdBy: by },
      update: { fileId: stored.id, pages: pages.length, net, createdBy: by, createdAt: new Date(), seenAt: null },
    });
    if (before) await deleteStoredFile(before.fileId);
  }

  const ids = [...pagesOf.keys()];
  later(async () => {
    for (const id of ids)
      await notify({
        workerIds: [id],
        workerUrl: `/app/nomina?mes=${month}`,
        title: "📄 Tu nómina ya está en la app",
        body: `Ya puedes ver tu nómina de ${monthName(month)} en «Nómina».`,
        tag: `nomina-${month}`,
        emailFallback: true,
      });
  });
  return { pages: texts.length, workers: ids.length, unknown };
}
