/** Tipos de incidencia (sin dependencias de servidor: se usan también en el navegador). */
export const INCIDENT_TYPES = ["ROTURA", "QUEJA", "ACCIDENTE", "PERSONAL", "OTRO"] as const;
export const INCIDENT_LABEL: Record<string, string> = {
  ROTURA: "Rotura / pérdida de material",
  QUEJA: "Queja del cliente",
  ACCIDENTE: "Accidente o lesión",
  PERSONAL: "Problema con el personal",
  OTRO: "Otro",
};
