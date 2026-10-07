import { NextResponse, type NextRequest } from "next/server";
import { getA3 } from "@/lib/a3";
import { getPaySettings } from "@/lib/pay";
import { ALTA_SELECT, buildAltaWorkbook, buildAmpWorkbook, buildBancoPagoWorkbook, buildImputacionWorkbook, bumpLastCode, getA3Alta, type AltaRow } from "@/lib/a3alta";
import { auditAdmin } from "@/lib/audit";
import { adminName } from "@/lib/auth";
import { db } from "@/lib/db";
import { today } from "@/lib/domain";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Guarda los datos revisados de cada alta (apellidos, sexo, nacimiento, nacionalidad y el código
 * asignado) y devuelve los Excel para importar en A3: el alta masiva y, según Ajustes → A3, la
 * imputación, banco de pago y «Camareros extras (AMP)». Van en JSON (base64) para descargarlos todos de una vez.
 */
export async function POST(req: NextRequest) {
  const by = await adminName();
  if (!by) return new NextResponse("No autorizado", { status: 401 });
  const form = await req.formData();
  const ids = form.getAll("id").map(String);
  if (!ids.length) return NextResponse.json({ error: "Marca al menos a una persona." }, { status: 400 });
  const get = (id: string, k: string) => String(form.get(`${k}_${id}`) ?? "").trim();

  const codes = ids.map((id) => get(id, "code"));
  if (codes.some((c) => !/^\d{1,10}$/.test(c))) return NextResponse.json({ error: "Cada alta necesita un código de trabajador numérico." }, { status: 400 });
  if (new Set(codes).size !== codes.length) return NextResponse.json({ error: "Hay códigos repetidos." }, { status: 400 });
  const taken = await db.worker.findMany({ where: { a3Code: { in: codes }, id: { notIn: ids } }, select: { name: true, a3Code: true } });
  if (taken.length) return NextResponse.json({ error: `Códigos ya usados: ${taken.map((t) => `${t.a3Code} (${t.name})`).join(", ")}.` }, { status: 400 });

  const rows: AltaRow[] = [];
  for (const id of ids) {
    const startDate = get(id, "start");
    const birthDate = get(id, "birth");
    if (!ISO.test(startDate)) return NextResponse.json({ error: "Falta la fecha de alta de alguien." }, { status: 400 });
    const sex = get(id, "sex");
    const worker = await db.worker.update({
      where: { id },
      data: {
        firstName: get(id, "first") || null,
        surname1: get(id, "s1") || null,
        surname2: get(id, "s2") || null,
        sex: sex === "Hombre" || sex === "Mujer" ? sex : null,
        ...(ISO.test(birthDate) && { birthDate }),
        nationality: get(id, "nat") || null,
        a3Code: get(id, "code"),
      },
      select: ALTA_SELECT,
    });
    rows.push({ code: get(id, "code"), startDate, worker });
  }
  const [a3, cfg] = await Promise.all([getA3(), getA3Alta()]);
  const day = today();
  const files = [{ name: `alta_a3_${day}.xlsx`, label: "Alta masiva de trabajadores", data: await buildAltaWorkbook(rows, a3.companyCode, cfg) }];
  const waiters = rows.filter((r) => r.worker.role !== "MOZO");
  if (cfg.imputation || cfg.imputationMozo) files.push({ name: `imputacion_a3_${day}.xlsx`, label: "Imputación", data: await buildImputacionWorkbook(rows, a3.companyCode, cfg) });
  const pay = await getPaySettings();
  if (pay.debtorIban) files.push({ name: `banco_pago_a3_${day}.xlsx`, label: "Datos Banco de Pago", data: await buildBancoPagoWorkbook(rows, a3.companyCode, pay.debtorIban) });
  if (cfg.ampExtra && waiters.length) files.push({ name: `camareros_extras_a3_${day}.xlsx`, label: "Camareros extras (AMP)", data: await buildAmpWorkbook(waiters, a3.companyCode) });
  await bumpLastCode(Math.max(...codes.map(Number)));
  await auditAdmin(by, "A3", "Alta masiva", `Excel de alta en A3 (${files.map((f) => f.label).join(", ")}) de ${rows.length}: ${rows.map((r) => `${r.worker.name} (${r.code})`).join(", ")}`);
  return NextResponse.json(
    { files: files.map((f) => ({ name: f.name, label: f.label, base64: f.data.toString("base64") })), missingImputation: !cfg.imputation && !cfg.imputationMozo, missingBank: !pay.debtorIban },
    { headers: { "Cache-Control": "no-store" } },
  );
}
