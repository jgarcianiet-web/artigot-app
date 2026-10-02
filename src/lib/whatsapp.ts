/**
 * Enlace de WhatsApp con el mensaje ya escrito (wa.me): RRHH lo pulsa, se abre la conversación con
 * esa persona y solo tiene que darle a enviar. Sirve para quien no tiene los avisos de la app activados.
 */
export function waLink(phone: string | null | undefined, text: string) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 9) digits = `34${digits}`; // móvil español sin prefijo
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
