-- CreateTable
CREATE TABLE "DocRequest" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "documentId" TEXT,
    "rejectReason" TEXT,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "DocRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocRequest_documentId_key" ON "DocRequest"("documentId");

-- CreateIndex
CREATE INDEX "DocRequest_workerId_status_idx" ON "DocRequest"("workerId", "status");

-- CreateIndex
CREATE INDEX "DocRequest_status_idx" ON "DocRequest"("status");

-- AddForeignKey
ALTER TABLE "DocRequest" ADD CONSTRAINT "DocRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocRequest" ADD CONSTRAINT "DocRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "WorkerDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

