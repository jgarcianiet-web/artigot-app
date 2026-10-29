-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "requestId" TEXT;

-- CreateTable
CREATE TABLE "SignRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "fileId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignRequest_fileId_key" ON "SignRequest"("fileId");

-- CreateIndex
CREATE INDEX "SignRequest_createdAt_idx" ON "SignRequest"("createdAt");

-- CreateIndex
CREATE INDEX "Contract_requestId_idx" ON "Contract"("requestId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignRequest" ADD CONSTRAINT "SignRequest_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

