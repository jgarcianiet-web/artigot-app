-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "irpf" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PayPeriod" (
    "id" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "payDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABIERTA',
    "closedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayLine" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "services" INTEGER NOT NULL DEFAULT 0,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "irpf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netOverride" DOUBLE PRECISION,
    "iban" TEXT,

    CONSTRAINT "PayLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "execDate" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employment" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "contractType" TEXT NOT NULL,
    "category" TEXT,
    "hoursPerWeek" DOUBLE PRECISION,
    "endReason" TEXT,
    "notes" TEXT,
    "startReported" BOOLEAN NOT NULL DEFAULT false,
    "endReported" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayPeriod_from_to_key" ON "PayPeriod"("from", "to");

-- CreateIndex
CREATE UNIQUE INDEX "PayLine_periodId_workerId_key" ON "PayLine"("periodId", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Remittance_msgId_key" ON "Remittance"("msgId");

-- CreateIndex
CREATE INDEX "Employment_workerId_startDate_idx" ON "Employment"("workerId", "startDate");

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
