/** Número en formato internacional sin «+» (lo que piden los enlaces de WhatsApp), o null si no hay. */
export function waNumber(phone: string | null | undefined) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 9) digits = `34${digits}`; // móvil español sin prefijo
  return digits;
}

/**
 * Enlace de WhatsApp con el mensaje ya escrito (wa.me): RRHH lo pulsa, se abre la conversación con
 * esa persona y solo tiene que darle a enviar. Sirve para quien no tiene los avisos de la app activados.
 */
export function waLink(phone: string | null | undefined, text: string) {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
