import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickableWorkers } from "@/lib/pickableWorkers";
import { RequestManyForm } from "./RequestManyForm";

export default async function NewDocRequest({ searchParams }: { searchParams: Promise<{ trabajador?: string }> }) {
  await requireAdmin();
  const { trabajador } = await searchParams;
  const workers = await pickableWorkers();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/documentos/pedidos" className="btn btn-sm shrink-0">‹ Pedidos</Link>
        <h1>Pedir un documento</h1>
      </div>
      <RequestManyForm workers={workers} initial={trabajador && workers.some((w) => w.id === trabajador) ? [trabajador] : []} />
    </div>
  );
}
