import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Las apps nativas cargan la web desplegada (CAP_SERVER_URL, p. ej. https://artigot.up.railway.app).
 * Así cualquier mejora de la web llega a las apps sin publicar una versión nueva;
 * la parte nativa aporta el icono en el móvil y las notificaciones push del sistema.
 */
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID ?? "es.artigot.personal",
  appName: "Artigot",
  webDir: "mobile/www",
  server: serverUrl
    ? { url: serverUrl, cleartext: serverUrl.startsWith("http:"), errorPath: "offline.html" }
    : undefined,
  backgroundColor: "#fafaf9",
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
