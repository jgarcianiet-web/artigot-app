import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickableWorkers } from "@/lib/pickableWorkers";
import { SignRequestForm } from "./SignRequestForm";

export default async function NewSignRequest({ searchParams }: { searchParams: Promise<{ trabajador?: string }> }) {
  await requireAdmin();
  const { trabajador } = await searchParams;
  const workers = await pickableWorkers();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/documentos/firmar" className="btn btn-sm shrink-0">‹ Para firmar</Link>
        <h1>Enviar documento para firmar</h1>
      </div>
      <SignRequestForm workers={workers} initial={trabajador && workers.some((w) => w.id === trabajador) ? [trabajador] : []} />
    </div>
  );
}
