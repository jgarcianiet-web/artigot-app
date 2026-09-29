-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "autoReplace" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "needResponsables" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Cada trabajador puede, al menos, desempeñar su puesto principal
UPDATE "Worker" SET "roles" = ARRAY["role"] WHERE cardinality("roles") = 0;

-- Tarifa inicial del camarero responsable (editable en RRHH > Tarifas)
INSERT INTO "Rate" ("role", "hourlyRate", "minHours") VALUES ('RESPONSABLE', 14, 4) ON CONFLICT ("role") DO NOTHING;
