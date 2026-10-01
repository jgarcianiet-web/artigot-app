-- Plus fijo por servicio en las tarifas
ALTER TABLE "Rate" ADD COLUMN "eventBonus" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Los camareros responsables cobran 10 € más por evento
UPDATE "Rate" SET "eventBonus" = 10 WHERE "role" = 'RESPONSABLE';

-- Precio por tipo de evento (boda, evento…) y tarifa propia por persona
ALTER TABLE "Rate" ADD COLUMN "typeRates" JSONB;
ALTER TABLE "Worker" ADD COLUMN "customRates" JSONB;
