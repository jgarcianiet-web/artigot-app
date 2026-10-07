-- Ya no hay contratos temporales: si se guardó el 6,55 % de antes (desempleo temporal 1,60), pasa al
-- 6,50 % de los fijos discontinuos (desempleo 1,55), que es lo que aplica A3
UPDATE "Setting" SET value = jsonb_set(value::jsonb, '{ssPct}', '6.5'::jsonb)
WHERE key = 'pagos' AND (value::jsonb ->> 'ssPct')::numeric = 6.55;
