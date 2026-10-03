import { db } from "./db";
import { addDays, formatDate } from "./domain";
import { getConvocationSettings } from "./convocation";
import { pendingPhotos } from "./photo";
import { coverage } from "./staffing";
import { missingAltas } from "./employment";

export type Task = { key: string; text: string; detail?: string; href: string; n: number; urgent?: boolean };

/**
 * «Tareas de hoy» del Panel: todo lo que RRHH tiene que hacer, en una lista, con el enlace a dónde
 * se hace. Lo que está al día no sale.
 */
export async function todayTasks(t: string): Promise<Task[]> {
  const conv = await getConvocationSettings();
  const remindBefore = new Date(Date.now() - conv.remindHours * 3_600_000);
  const [noAlta, altas, bajas, noAnswer, events, drafts, docs, photos, candidates, incidents, openShifts] = await Promise.all([
    missingAltas(t, 7),
    // Altas de hoy y mañana sin comunicar (el alta va antes de empezar a trabajar)
    db.employment.findMany({ where: { startReported: false, startDate: { gte: addDays(t, -3), lte: addDays(t, 1) } }, select: { startDate: true } }),
    // Bajas de los últimos 3 días sin comunicar (plazo de 3 días naturales)
    db.employment.findMany({ where: { endReported: false, endDate: { gte: addDays(t, -3), lte: t } }, select: { endDate: true } }),
    db.assignment.findMany({
      where: { status: "CONVOCADO", event: { date: { gte: t }, status: "ABIERTO" }, OR: [{ noticeAt: { lte: remindBefore } }, { noticeAt: null, createdAt: { lte: remindBefore } }] },
      select: { eventId: true, event: { select: { name: true, date: true } } },
    }),
    db.event.findMany({
      where: { date: { gte: t, lte: addDays(t, 7) }, status: "ABIERTO" },
      include: { assignments: { select: { role: true, status: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.eventDraft.findMany({ where: { date: { gte: t, lte: addDays(t, 7) } }, orderBy: { date: "asc" }, select: { id: true, name: true, date: true } }),
    db.workerDocument.count({ where: { verified: false, worker: { active: true } } }),
    pendingPhotos(),
    db.candidate.count({ where: { seenAt: null } }),
    db.incident.count({ where: { resolved: false } }),
    // Servicios de ayer y anteayer con la entrada fichada y sin salida (horas por cerrar)
    db.assignment.findMany({
      where: { status: "CONFIRMADO", checkIn: { not: null }, checkOut: null, hoursOverride: null, event: { date: { gte: addDays(t, -2), lt: t } } },
      select: { eventId: true, event: { select: { name: true } } },
    }),
  ]);
  const uncovered = events
    .map((e) => {
      const cov = coverage(e, e.assignments);
      return { e, missing: cov.reduce((s, c) => s + Math.max(0, c.need - c.confirmed), 0) };
    })
    .filter((x) => x.missing > 0);
  const firstEvent = (ids: string[]) => ids[0];
  const names = (list: string[]) => [...new Set(list)].slice(0, 3).join(", ") + (new Set(list).size > 3 ? "…" : "");

  const tasks: Task[] = [
    {
      key: "sinalta",
      n: noAlta.length,
      urgent: true,
      text: `${noAlta.length} ${noAlta.length === 1 ? "confirmado" : "confirmados"} sin alta en los próximos 7 días`,
      detail: "Tienen un alta puesta a mano que no cubre ese día: corrígela o bórrala y se generará sola",
      href: "/admin/altas",
    },
    {
      key: "altas",
      n: altas.length + bajas.length,
      urgent: altas.some((a) => a.startDate <= addDays(t, 1)) || bajas.length > 0,
      text: `Comunicar ${altas.length} ${altas.length === 1 ? "alta" : "altas"} y ${bajas.length} ${bajas.length === 1 ? "baja" : "bajas"} a la Seguridad Social`,
      detail: "Descarga los Excel para A3 del día y márcalos como comunicados",
      href: `/admin/altas?dia=${altas.find((a) => a.startDate >= t)?.startDate ?? bajas[0]?.endDate ?? t}`,
    },
    {
      key: "sinrespuesta",
      n: noAnswer.length,
      text: `${noAnswer.length} ${noAnswer.length === 1 ? "convocado lleva" : "convocados llevan"} más de ${conv.remindHours} h sin contestar`,
      detail: names(noAnswer.map((a) => a.event.name)),
      href: `/admin/eventos/${firstEvent(noAnswer.map((a) => a.eventId))}`,
    },
    {
      key: "cubrir",
      n: uncovered.length,
      urgent: uncovered.some((x) => x.e.date <= addDays(t, 2)),
      text: `${uncovered.length} ${uncovered.length === 1 ? "evento" : "eventos"} de los próximos 7 días sin cubrir`,
      detail: uncovered.slice(0, 3).map((x) => `${x.e.name} (${formatDate(x.e.date)}, faltan ${x.missing})`).join(" · "),
      href: `/admin/eventos/${uncovered[0]?.e.id}`,
    },
    {
      key: "borradores",
      n: drafts.length,
      text: `${drafts.length} ${drafts.length === 1 ? "borrador" : "borradores"} del cuadrante sin confirmar esta semana`,
      detail: names(drafts.map((d) => `${d.name} (${formatDate(d.date)})`)),
      href: `/admin/cuadrante/borrador/${drafts[0]?.id}`,
    },
    {
      key: "horas",
      n: openShifts.length,
      text: `${openShifts.length} ${openShifts.length === 1 ? "servicio" : "servicios"} de ayer con la salida sin fichar`,
      detail: names(openShifts.map((a) => a.event.name)),
      href: `/admin/eventos/${openShifts[0]?.eventId}`,
    },
    { key: "documentos", n: docs + photos, text: `${docs + photos} ${docs + photos === 1 ? "documento o foto" : "documentos y fotos"} por revisar`, href: "/admin/documentos" },
    { key: "candidatos", n: candidates, text: `${candidates} ${candidates === 1 ? "candidato nuevo" : "candidatos nuevos"} sin ver`, href: "/admin/candidatos" },
    { key: "incidencias", n: incidents, text: `${incidents} ${incidents === 1 ? "incidencia abierta" : "incidencias abiertas"}`, href: "/admin/incidencias" },
  ];
  return tasks.filter((x) => x.n > 0);
}
