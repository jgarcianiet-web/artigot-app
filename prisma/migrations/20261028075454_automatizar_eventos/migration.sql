-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "birthDate" TEXT,
ADD COLUMN     "dni" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "nss" TEXT,
ADD COLUMN     "sex" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "autoConvokeDays" INTEGER,
ADD COLUMN     "autoConvokedAt" TIMESTAMP(3),
ADD COLUMN     "guests" INTEGER;

