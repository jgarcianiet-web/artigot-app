/** Tipos de contrato y motivos de baja (sin dependencias de servidor: se usan en formularios). */
export const CONTRACT_TYPES = [
  "Eventual (circunstancias de la producción)",
  "Fijo discontinuo",
  "Indefinido",
  "Temporal por sustitución",
  "Otro",
] as const;

export const END_REASONS = [
  "Fin de contrato",
  "Fin de llamamiento (fijo discontinuo)",
  "Baja voluntaria",
  "No supera el periodo de prueba",
  "Despido",
  "Otro",
] as const;
