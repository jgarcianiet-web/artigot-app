import { after } from "next/server";
import type { Viewer } from "./auth";
import { db } from "./db";
import { formatDate } from "./domain";
import { storeImage } from "./files";
import { INCIDENT_LABEL, INCIDENT_TYPES } from "./incidentTypes";
import { notify } from "./push";

export type IncidentResult = { ok: boolean; message: string };

/** Registra una incidencia (con fotos opcionales) y avisa a RRHH si la registra el maître / responsable. */
export async function createIncident(viewer: Viewer, eventId: string, form: FormData): Promise<IncidentResult> {
  const type = String(form.get("type") ?? "");
  const description = String(form.get("description") ?? "").trim().slice(0, 2000);
  const workerId = String(form.get("workerId") ?? "") || null;
  if (!(INCIDENT_TYPES as readonly string[]).includes(type)) return { ok: false, message: "Elige el tipo de incidencia." };
  if (description.length < 3) return { ok: false, message: "Describe brevemente lo ocurrido." };
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);

  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  if (workerId && !(await db.assignment.findUnique({ where: { eventId_workerId: { eventId, workerId } } }))) {
    return { ok: false, message: "Esa persona no está en este evento." };
  }
  const incident = await db.incident.create({
    data: {
      eventId,
      type,
      description,
      workerId,
      reporterId: viewer.kind === "worker" ? viewer.id : null,
      reporterAdmin: viewer.kind === "admin" ? viewer.name : null,
    },
  });
  try {
    for (const p of photos) await storeImage(p, { eventId, scope: "INCIDENT", incidentId: incident.id });
  } catch (e) {
    return { ok: false, message: `Incidencia guardada, pero una foto no se pudo subir: ${(e as Error).message}` };
  }
  if (viewer.kind === "worker") {
    after(() =>
      notify({
        admins: true,
        adminUrl: `/admin/eventos/${eventId}/directo`,
        title: `⚠ Incidencia: ${INCIDENT_LABEL[type]}`,
        body: `${event.name} (${formatDate(event.date)}) · ${viewer.name}: ${description.slice(0, 120)}`,
        tag: `inc-${incident.id}`,
      }),
    );
  }
  return { ok: true, message: "Incidencia registrada. RRHH ya está avisado." };
}
