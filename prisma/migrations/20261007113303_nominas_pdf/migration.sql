-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "net" DOUBLE PRECISION,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_fileId_key" ON "Payslip"("fileId");

-- CreateIndex
CREATE INDEX "Payslip_month_idx" ON "Payslip"("month");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_workerId_month_key" ON "Payslip"("workerId", "month");

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

