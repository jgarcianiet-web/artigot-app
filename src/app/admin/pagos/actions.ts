"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCompany } from "@/lib/contracts";
import { db } from "@/lib/db";
import { euro, formatDate, today } from "@/lib/domain";
import { norm, readTable } from "@/lib/importStaff";
import { closePeriod, getPaySettings, halfFromKey, halfLabel, payPeriod, type Half } from "@/lib/pay";
import { notify } from "@/lib/push";
import { buildPain001, checkDebtor, paymentRef, parseAddress, sepaStamp } from "@/lib/sepa";
import { validIban } from "@/lib/staff";
import { auditAdmin, diff } from "@/lib/audit";

export type PayResult = { ok: boolean; message: string; remittanceId?: string } | null;

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function half(key: string): Half {
  const h = halfFromKey(key);
  if (!h) throw new Error("Quincena no válida");
  return h;
}

async function ensurePeriod(h: Half, by: string) {
  const p = await payPeriod(h);
  return db.payPeriod.upsert({
    where: { from_to: { from: h.from, to: h.to } },
    create: { from: h.from, to: h.to, payDate: p.payDate, updatedBy: by },
    update: {},
  });
}

const done = (h: Half) => {
  revalidatePath("/admin/pagos");
  revalidatePath("/app/nomina");
  return h;
};

/** Fecha estimada de pago de la quincena; se avisa al personal que tiene servicios en ella. */
export async function setPayDate(key: string, _prev: PayResult, form: FormData): Promise<PayResult> {
  const by = await requireAdmin();
  const h = half(key);
  const date = String(form.get("payDate") ?? "");
  if (!isDate(date)) return { ok: false, message: "Indica una fecha." };
  if (date <= h.to) return { ok: false, message: "La fecha de pago tiene que ser posterior al final de la quincena." };
  const period = await ensurePeriod(h, by);
  if (period.status === "PAGADA") return { ok: false, message: "Esta quincena ya está pagada." };
  await db.payPeriod.update({ where: { id: period.id }, data: { payDate: date, updatedBy: by } });
  await auditAdmin(by, "Pago", "Fecha de pago", `Quincena ${halfLabel(h)}: fecha de pago ${period.payDate} → ${date}`, { entityId: h.key });
  const { rows } = await payPeriod(h);
  if (form.get("notify") === "1" && rows.length) {
    after(() =>
      notify({
        workerIds: rows.map((r) => r.workerId),
        workerUrl: `/app/nomina?q=${h.key}`,
        title: "Fecha de pago",
        body: `Los servicios del ${halfLabel(h)} se pagarán el ${formatDate(date, { long: true })}.`,
        tag: `pago-${h.key}`,
      }),
    );
  }
  done(h);
  return { ok: true, message: `Fecha de pago: ${formatDate(date, { long: true })}.${form.get("notify") === "1" && rows.length ? ` Avisadas ${rows.length} personas.` : ""}` };
}

const parseAmount = (v: string) => {
  let s = v.trim().replace(/[€\s]/g, "");
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else s = s.replace(/,/g, ""); // 1,234.56
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

async function writeOverrides(h: Half, by: string, values: Map<string, number | null>, how: string) {
  const period = await ensurePeriod(h, by);
  if (period.status !== "ABIERTA") throw new Error("La quincena está cerrada. Reábrela para cambiar los netos.");
  const old = new Map((await db.payLine.findMany({ where: { periodId: period.id }, include: { worker: { select: { name: true } } } })).map((l) => [l.workerId, l]));
  const names = new Map((await db.worker.findMany({ where: { id: { in: [...values.keys()] } }, select: { id: true, name: true } })).map((w) => [w.id, w.name]));
  const changes = [...values].filter(([w, v]) => (old.get(w)?.netOverride ?? null) !== v).map(([w, v]) => `${names.get(w) ?? w}: ${old.get(w)?.netOverride ?? "estimado"} → ${v ?? "estimado"}`);
  if (changes.length) await auditAdmin(by, "Pago", how, `Quincena ${halfLabel(h)} · netos: ${changes.join("; ")}`, { entityId: h.key });
  await db.$transaction(
    [...values].map(([workerId, v]) =>
      db.payLine.upsert({
        where: { periodId_workerId: { periodId: period.id, workerId } },
        create: { periodId: period.id, workerId, netOverride: v },
        update: { netOverride: v },
      }),
    ),
  );
}

/** Neto real de cada persona (el de la nómina de A3). Vacío = se usa el estimado. */
export async function saveNets(key: string, _prev: PayResult, form: FormData): Promise<PayResult> {
  const by = await requireAdmin();
  const h = half(key);
  const { rows } = await payPeriod(h);
  const values = new Map<string, number | null>();
  for (const r of rows) {
    const raw = String(form.get(`net_${r.workerId}`) ?? "");
    const v = raw.trim() ? parseAmount(raw) : null;
    if (raw.trim() && v == null) return { ok: false, message: `Importe no válido para ${r.name}: «${raw}»` };
    values.set(r.workerId, v);
  }
  try {
    await writeOverrides(h, by, values, "Netos a mano");
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  done(h);
  return { ok: true, message: "Netos guardados." };
}

/**
 * Importa los netos desde un Excel (p. ej. el listado de nóminas de A3): busca una columna con el
 * DNI/NIF o el código de trabajador y otra con el líquido/neto.
 */
export async function importNets(key: string, _prev: PayResult, form: FormData): Promise<PayResult> {
  const by = await requireAdmin();
  const h = half(key);
  const table = await readTable(form.get("file") as File);
  if ("error" in table) return { ok: false, message: table.error };
  let hdr = -1, idCol = -1, codeCol = -1, netCol = -1;
  for (let i = 0; i < Math.min(15, table.length) && hdr < 0; i++) {
    const cells = table[i].map(norm);
    idCol = cells.findIndex((c) => /\b(dni|nif|nie|documento)\b/.test(c));
    codeCol = cells.findIndex((c) => /\b(codigo|cod|trabajador n|n trabajador)\b/.test(c) && !/empresa|concepto/.test(c));
    netCol = cells.findIndex((c) => /\b(liquido|neto|a percibir|importe neto|total a percibir)\b/.test(c));
    if ((idCol >= 0 || codeCol >= 0) && netCol >= 0) hdr = i;
  }
  if (hdr < 0) return { ok: false, message: "No encuentro las columnas. Hacen falta una con el DNI/NIF (o el código de trabajador) y otra con el líquido o neto." };
  const { rows } = await payPeriod(h);
  const byDni = new Map(rows.filter((r) => r.dni).map((r) => [r.dni!.toUpperCase(), r]));
  const byCode = new Map(rows.filter((r) => r.a3Code).map((r) => [r.a3Code!.replace(/^0+/, ""), r]));
  const values = new Map<string, number | null>();
  const unknown: string[] = [];
  for (const row of table.slice(hdr + 1)) {
    const id = idCol >= 0 ? (row[idCol] ?? "").toUpperCase().replace(/[\s.-]/g, "") : "";
    const code = codeCol >= 0 ? (row[codeCol] ?? "").trim().replace(/^0+/, "") : "";
    const net = parseAmount(row[netCol] ?? "");
    if ((!id && !code) || net == null) continue;
    const r = (id && byDni.get(id)) || (code && byCode.get(code));
    if (!r) unknown.push(id || code);
    else values.set(r.workerId, net);
  }
  if (!values.size) return { ok: false, message: "No coincide ninguna fila con el personal de esta quincena." };
  try {
    await writeOverrides(h, by, values, "Netos importados");
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  done(h);
  const missing = rows.filter((r) => !values.has(r.workerId) && !r.final).map((r) => r.name);
  return {
    ok: true,
    message: `${values.size} netos importados.${unknown.length ? ` No están en esta quincena: ${unknown.slice(0, 8).join(", ")}${unknown.length > 8 ? "…" : ""}.` : ""}${missing.length ? ` Siguen con el neto estimado: ${missing.join(", ")}.` : ""}`,
  };
}

/** Genera la remesa SEPA y congela los importes de la quincena. */
export async function generateRemittance(key: string, _prev: PayResult, form: FormData): Promise<PayResult> {
  const by = await requireAdmin();
  const h = half(key);
  const [company, s, current] = await Promise.all([getCompany(), getPaySettings(), payPeriod(h)]);
  if (current.status === "PAGADA") return { ok: false, message: "Esta quincena ya está pagada." };
  const debtor = { name: company.name, nif: company.cif, suffix: s.sepaSuffix, iban: s.debtorIban, bic: s.debtorBic || undefined };
  const errors = checkDebtor(debtor);
  if (errors.length) return { ok: false, message: errors.join(" ") };
  const pending = current.rows.reduce((n, r) => n + r.pending, 0);
  if (current.status === "ABIERTA" && pending && form.get("force") !== "1") {
    return { ok: false, message: `Hay ${pending} servicios sin horas cerradas; no se pagarían en esta remesa. Ciérralos en Liquidación o marca «Generar igualmente».` };
  }
  // Antes de cerrar la quincena: si no hay a quién pagar, no se toca nada
  if (!current.rows.some((r) => r.net > 0 && r.iban && validIban(r.iban))) {
    return { ok: false, message: "No hay nadie con importe y un IBAN válido en esta quincena. La quincena sigue como estaba." };
  }
  await closePeriod(h, by);
  const { rows, payDate } = await payPeriod(h);
  const payable = rows.filter((r) => r.net > 0 && r.iban && validIban(r.iban));
  const skipped = rows.filter((r) => r.net > 0 && !(r.iban && validIban(r.iban))).map((r) => r.name);
  if (!payable.length) return { ok: false, message: "No hay nadie con importe y un IBAN válido en esta quincena." };
  const execDate = payDate > today() ? payDate : today();
  const createdAt = new Date();
  const stamp = sepaStamp(createdAt);
  const msgId = `${company.cif.toUpperCase()}${stamp}`;
  const addresses = new Map(
    (await db.worker.findMany({ where: { id: { in: payable.map((r) => r.workerId) } }, select: { id: true, address: true } })).map((w) => [w.id, parseAddress(w.address)]),
  );
  // «ABONO NOMINA 01-15/09/2026», como el concepto que ya usáis en las remesas
  const concept = `Abono nomina ${h.from.slice(8)}-${h.to.slice(8)}/${h.from.slice(5, 7)}/${h.from.slice(0, 4)}`;
  const xml = buildPain001({
    msgId,
    createdAt,
    execDate,
    debtor,
    payments: payable.map((r, i) => ({ id: paymentRef(r.dni, stamp, i + 1), name: r.name, iban: r.iban!, amount: r.net, concept, ...addresses.get(r.workerId) })),
  });
  const total = Math.round(payable.reduce((t, r) => t + r.net, 0) * 100) / 100;
  const rem = await db.remittance.create({
    data: { periodId: current.period?.id ?? (await ensurePeriod(h, by)).id, msgId, count: payable.length, total, execDate, xml, createdBy: by, workerIds: payable.map((r) => r.workerId) },
  });
  await auditAdmin(by, "Remesa", "Generada", `Remesa de la quincena ${halfLabel(h)}: ${payable.length} transferencias, ${euro(total)}, ejecución ${execDate}${skipped.length ? `; sin IBAN: ${skipped.join(", ")}` : ""}`, { entityId: h.key, data: { msgId, lines: payable.map((r) => ({ name: r.name, net: r.net })) } });
  done(h);
  return {
    ok: true,
    remittanceId: rem.id,
    message: `Remesa de ${payable.length} transferencias por ${euro(total)} con fecha ${formatDate(execDate, { long: true })}.${skipped.length ? ` Sin IBAN válido (págales aparte): ${skipped.join(", ")}.` : ""}`,
  };
}

export async function reopenPeriod(key: string) {
  const by = await requireAdmin();
  const h = half(key);
  const r = await db.payPeriod.updateMany({ where: { from: h.from, to: h.to, status: "CERRADA" }, data: { status: "ABIERTA", closedAt: null, updatedBy: by } });
  if (r.count) await auditAdmin(by, "Pago", "Reabierta", `Quincena ${halfLabel(h)} reabierta`, { entityId: h.key });
  done(h);
}

/**
 * Marca la quincena como pagada y avisa a cada persona de su importe. Si se pagó con remesa, solo se avisa a
 * quien iba en ella: a quien quedó fuera (sin IBAN válido) se le paga aparte y no recibe un «te hemos pagado».
 */
export async function markPaid(key: string) {
  const by = await requireAdmin();
  const h = half(key);
  const period = await db.payPeriod.findFirst({ where: { from: h.from, to: h.to }, include: { remittances: { select: { workerIds: true } } } });
  const res = await db.payPeriod.updateMany({ where: { from: h.from, to: h.to, status: "CERRADA" }, data: { status: "PAGADA", paidAt: new Date(), updatedBy: by } });
  if (!res.count) return;
  const { rows } = await payPeriod(h);
  const inRemittance = new Set(period?.remittances.flatMap((r) => r.workerIds) ?? []);
  const remitted = period?.remittances.length ?? 0;
  // Remesas anteriores a guardar quién iba: se toma a quien tiene un IBAN válido (los mismos que entraron)
  const included = (x: (typeof rows)[number]) =>
    !remitted || (inRemittance.size ? inRemittance.has(x.workerId) : !!x.iban && validIban(x.iban));
  const paid = rows.filter((x) => x.net > 0 && included(x));
  const outside = rows.filter((x) => x.net > 0 && !paid.includes(x)).map((x) => x.name);
  await auditAdmin(by, "Pago", "Pagada", `Quincena ${halfLabel(h)} marcada como pagada (${paid.length} personas, ${euro(paid.reduce((t, x) => t + x.net, 0))})${outside.length ? `; fuera de la remesa, sin aviso de pago: ${outside.join(", ")}` : ""}`, { entityId: h.key });
  after(async () => {
    for (const r of paid) {
      await notify({
        workerIds: [r.workerId],
        workerUrl: `/app/nomina?q=${h.key}`,
        title: "💶 Pago realizado",
        body: `Te hemos pagado ${euro(r.net)} por los servicios del ${halfLabel(h)}.`,
        tag: `pago-${h.key}`,
      });
    }
  });
  done(h);
}

// ---------- Ajustes ----------

export async function savePaySettings(_prev: string | null, form: FormData) {
  const by = await requireAdmin();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const pct = (k: string) => Number(get(k).replace(",", "."));
  const value = {
    ssPct: pct("ssPct"),
    irpfPct: pct("irpfPct"),
    ratesAreNet: form.get("ratesAreNet") === "on",
    firstHalfDay: Number(get("firstHalfDay")),
    secondHalfDay: Number(get("secondHalfDay")),
    debtorIban: get("debtorIban").toUpperCase().replace(/\s/g, ""),
    debtorBic: get("debtorBic").toUpperCase(),
    sepaSuffix: get("sepaSuffix").toUpperCase() || "000",
  };
  if (![value.ssPct, value.irpfPct].every((n) => Number.isFinite(n) && n >= 0 && n <= 50)) return "Los porcentajes tienen que estar entre 0 y 50.";
  if (![value.firstHalfDay, value.secondHalfDay].every((n) => Number.isInteger(n) && n >= 1 && n <= 31)) return "Los días de pago tienen que estar entre 1 y 31.";
  if (value.debtorIban && !validIban(value.debtorIban)) return "El IBAN de la empresa no es correcto.";
  if (value.debtorBic && !/^[A-Z]{6}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/.test(value.debtorBic)) return "El BIC no es correcto (8 u 11 caracteres).";
  if (!/^[A-Z0-9]{3}$/.test(value.sepaSuffix)) return "El sufijo tiene que tener 3 caracteres (normalmente 000).";
  const before = await getPaySettings();
  await db.setting.upsert({ where: { key: "pagos" }, create: { key: "pagos", value }, update: { value } });
  const d = diff(before, value, { ssPct: "% Seg. Social", irpfPct: "% IRPF", ratesAreNet: "Tarifas netas", firstHalfDay: "Día de pago 1ª quincena", secondHalfDay: "Día de pago 2ª quincena", debtorIban: "IBAN empresa", debtorBic: "BIC", sepaSuffix: "Sufijo" });
  if (d.changed) await auditAdmin(by, "Ajustes", "Pagos", d.text, { data: d.data });
  revalidatePath("/admin/ajustes/pagos");
  revalidatePath("/app/nomina");
  revalidatePath("/admin/pagos");
  return "Guardado.";
}
