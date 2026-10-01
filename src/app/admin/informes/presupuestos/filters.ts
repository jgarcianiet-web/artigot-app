import { today } from "@/lib/domain";
import { monthRange } from "@/lib/payroll";

const isDate = (v?: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Filtros del informe: periodo (por defecto, el mes actual) y comercial («-» = sin comercial). */
export function budgetFilters(sp: { desde?: string | null; hasta?: string | null; comercial?: string | null }) {
  const def = monthRange(today());
  const from = isDate(sp.desde) ? sp.desde! : def.from;
  const to = isDate(sp.hasta) ? sp.hasta! : def.to;
  const salesRep = sp.comercial?.trim() || undefined;
  const qs = new URLSearchParams({ desde: from, hasta: to, ...(salesRep && { comercial: salesRep }) }).toString();
  return { from, to, salesRep, qs };
}
