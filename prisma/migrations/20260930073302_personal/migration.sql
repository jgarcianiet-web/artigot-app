-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "checklist" TEXT;

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "checklist" TEXT;

-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "workerId" TEXT;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TEXT,
ADD COLUMN     "dni" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "nss" TEXT;

-- CreateTable
CREATE TABLE "WorkerDocument" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TEXT,
    "fileId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwapRequest" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fromWorkerId" TEXT NOT NULL,
    "toWorkerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPUESTO',
    "message" TEXT,
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "deliveredAt" TEXT NOT NULL,
    "returnedAt" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerDocument_fileId_key" ON "WorkerDocument"("fileId");

-- CreateIndex
CREATE INDEX "WorkerDocument_workerId_idx" ON "WorkerDocument"("workerId");

-- CreateIndex
CREATE INDEX "WorkerDocument_expiresAt_idx" ON "WorkerDocument"("expiresAt");

-- CreateIndex
CREATE INDEX "SwapRequest_status_idx" ON "SwapRequest"("status");

-- CreateIndex
CREATE INDEX "Loan_workerId_idx" ON "Loan"("workerId");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapRequest" ADD CONSTRAINT "SwapRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapRequest" ADD CONSTRAINT "SwapRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapRequest" ADD CONSTRAINT "SwapRequest_fromWorkerId_fkey" FOREIGN KEY ("fromWorkerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapRequest" ADD CONSTRAINT "SwapRequest_toWorkerId_fkey" FOREIGN KEY ("toWorkerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
