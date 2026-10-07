-- AlterTable
ALTER TABLE "Remittance" ADD COLUMN     "workerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

