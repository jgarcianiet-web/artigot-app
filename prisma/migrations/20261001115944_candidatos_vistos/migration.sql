-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "seenAt" TIMESTAMP(3);


-- Los que ya se están tramitando no cuentan como nuevos; los que siguen en «Nuevo», sí
UPDATE "Candidate" SET "seenAt" = "createdAt" WHERE "status" <> 'NUEVO';
