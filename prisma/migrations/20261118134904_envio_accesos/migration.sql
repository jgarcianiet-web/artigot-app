-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "accessEmailedAt" TIMESTAMP(3),
ADD COLUMN     "accessEmails" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstLoginAt" TIMESTAMP(3);
-- Quien ya ha usado la app (tiene un móvil con avisos, ha firmado algo o ha escrito en un chat) cuenta como que ya ha entrado
UPDATE "Worker" w SET "firstLoginAt" = w."createdAt"
WHERE EXISTS (SELECT 1 FROM "Device" d WHERE d."workerId" = w.id)
   OR EXISTS (SELECT 1 FROM "Contract" c WHERE c."workerId" = w.id AND c."signedAt" IS NOT NULL)
   OR EXISTS (SELECT 1 FROM "Message" m WHERE m."workerId" = w.id);
