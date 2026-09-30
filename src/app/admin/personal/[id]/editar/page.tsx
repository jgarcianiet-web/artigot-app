import { identityDocStatus } from "@/lib/identityDocs";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { WorkerForm } from "../../WorkerForm";

export default async function EditWorker({ params }: { params: Promise<{ id: string }> }) {
  const worker = await db.worker.findUnique({ where: { id: (await params).id } });
  if (!worker) notFound();
  return (
    <div className="space-y-4">
      <h1>Editar trabajador</h1>
      <WorkerForm worker={worker} docs={await identityDocStatus(worker.id)} />
    </div>
  );
}
