import { headers } from "next/headers";
import { appUrl } from "./domain";

/**
 * Dirección con la que se está usando la app ahora mismo (la de la barra del navegador). Para los enlaces que se
 * muestran en pantalla, así salen bien aunque APP_URL esté mal puesta. Fuera de una petición, usa appUrl().
 */
export async function requestUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host");
  if (!host) return appUrl();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
