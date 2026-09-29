-- Tarifas iniciales (editables en RRHH > Tarifas)
INSERT INTO "Rate" ("role", "hourlyRate", "minHours") VALUES
  ('CAMARERO', 12, 4),
  ('MAITRE', 16, 5),
  ('MOZO', 11, 3)
ON CONFLICT ("role") DO NOTHING;
