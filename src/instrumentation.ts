/** Se ejecuta una vez al arrancar el servidor: pone en marcha los avisos automáticos. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.REMINDERS !== "off") {
    const { startReminderLoop } = await import("./lib/reminders");
    startReminderLoop();
  }
}
