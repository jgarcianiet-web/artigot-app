import Link from "next/link";
import { notFound } from "next/navigation";
import { copyToDraft } from "@/app/actions";
import { CopyForm } from "@/components/CopyForm";
import { db } from "@/lib/db";
import { addDays, formatDate } from "@/lib/domain";

/** Copiar un evento o un borrador del cuadrante a otro día. */
export default async function CopyPage({ searchParams }: { searchParams: Promise<{ k?: string; id?: string }> }) {
  const { k = "", id = "" } = await searchParams;
  const src =
    k === "evento"
      ? await db.event.findUnique({ where: { id }, select: { name: true, date: true, venue: true, _count: { select: { assignments: { where: { status: { in: ["CONVOCADO", "CONFIRMADO"] } } } } } } }).then((e) => e && { name: e.name, date: e.date, venue: e.venue, staff: e._count.assignments })
      : await db.eventDraft.findUnique({ where: { id } }).then((d) => d && { name: d.name, date: d.date, venue: (d.form as Record<string, string>).venue ?? "", staff: (d.staff as unknown[]).length });
  if (!src) notFound();
  return (
    <div className="max-w-2xl space-y-4">
      <Link href={`/admin/cuadrante?semana=${src.date}`} className="text-sm text-stone-500 hover:underline">‹ Cuadrante</Link>
      <h1>Copiar «{src.name}»</h1>
      <p className="text-sm text-stone-600">
        {formatDate(src.date, { long: true })} · {src.venue}{src.staff ? ` · ${src.staff} personas` : ""}. La copia se crea como <strong>borrador</strong>: no avisa a nadie hasta que la confirmes.
      </p>
      <div className="card">
        <CopyForm action={copyToDraft.bind(null, k === "evento" ? "evento" : "borrador", id)} defaultDate={addDays(src.date, 7)} hasStaff={src.staff > 0} />
      </div>
    </div>
  );
}
