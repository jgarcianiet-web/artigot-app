-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "label" TEXT,
ADD COLUMN     "lastAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastOkAt" TIMESTAMP(3);

