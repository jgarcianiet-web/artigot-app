-- AlterTable
ALTER TABLE "Employment" ADD COLUMN     "warningAt" TIMESTAMP(3),
ADD COLUMN     "warningKind" TEXT;


-- Los avisos que ya había: los de «ya no tiene servicios», «ahora es fijo» y «se ha unido» son para anular
UPDATE "Employment" SET "warningKind" = CASE WHEN "warning" LIKE '%anula%' THEN 'ANULAR' ELSE 'CORREGIR' END, "warningAt" = NOW() WHERE "warning" IS NOT NULL;
