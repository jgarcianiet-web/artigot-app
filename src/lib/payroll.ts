import { db } from "./db";
import { payable, rateFor, workedHours } from "./domain";

export async function payrollLines(from: string, to: string) {
  const [assignments, rates] = await Promise.all([
    db.assignment.findMany({
      where: { status: "CONFIRMADO", event: { date: { gte: from, lte: to } } },
      include: { worker: true, event: true },
      orderBy: [{ worker: { name: "asc" } }, { event: { date: "asc" } }],
    }),
    db.rate.findMany(),
  ]);
  return assignments.map((a) => {
    const hours = workedHours(a);
    const rate = rateFor(rates, a.role, a.event.type, a.worker.customRates);
    const { billedHours, amount, bonus } = payable(hours, rate);
    return { a, hours, billedHours, amount, bonus, hourlyRate: rate?.hourlyRate ?? 0 };
  });
}

export type PayrollLine = Awaited<ReturnType<typeof payrollLines>>[number];

export function summarize(lines: PayrollLine[]) {
  const byWorker = new Map<
    string,
    { worker: PayrollLine["a"]["worker"]; services: number; hours: number; amount: number; missing: number }
  >();
  for (const l of lines) {
    const row = byWorker.get(l.a.workerId) ?? { worker: l.a.worker, services: 0, hours: 0, amount: 0, missing: 0 };
    row.services += 1;
    row.hours += l.billedHours ?? 0;
    row.amount += l.amount;
    if (l.hours == null) row.missing += 1;
    byWorker.set(l.a.workerId, row);
  }
  return [...byWorker.values()];
}

export function monthRange(today: string) {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}
