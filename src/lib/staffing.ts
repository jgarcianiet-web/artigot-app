import { later } from "./later";
import { db } from "./db";
import { addDays, callTime, formatDate, needFor, type Needs, ROLE_LABEL, ROLES, type Role, today, workerRoles } from "./domain";
import { notify } from "./push";
import { computeScores, type Score } from "./scoring";
import { availableOn } from "./polls";

export const ACTIVE_STATUSES = ["CONVOCADO", "CONFIRMADO"];

export type Candidate = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  mainRole: string;
  rating: number;
  zone: string | null;
  recentEvents: number;
  score: Score;
  /** Ha dicho en un sondeo que puede trabajar ese día */
  available: boolean;
};

/**
 * Trabajadores disponibles para un evento, por puesto.
 * Excluye: inactivos, no disponibles ese día, ya ocupados en otro evento ese día
 * y los que ya han estado en este evento (también quien rechazó: no se le vuelve a convocar solo).
 * Un trabajador aparece en cada puesto que puede desempeñar (p. ej. camarero y camarero responsable).
 * Ordena por la puntuación del algoritmo (ver scoring.ts).
 */
export async function candidatesFor(event: { id: string; date: string }) {
  const [workers, recent] = await Promise.all([
    db.worker.findMany({
      where: {
        active: true,
        unavailabilities: { none: { date: event.date } },
        assignments: {
          none: {
            OR: [{ eventId: event.id }, { status: { in: ACTIVE_STATUSES }, event: { date: event.date } }],
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.assignment.groupBy({
      by: ["workerId"],
      where: {
        status: "CONFIRMADO",
        event: { date: { gte: addDays(event.date, -30), lte: event.date } },
      },
      _count: true,
    }),
  ]);
  const recentByWorker = new Map(recent.map((r) => [r.workerId, r._count]));
  const said = await availableOn(event.date);
  const scores = await computeScores(workers.map((w) => w.id), event.date);

  const byRole = Object.fromEntries(ROLES.map((r) => [r, [] as Candidate[]])) as Record<Role, Candidate[]>;
  for (const w of workers) {
    for (const role of workerRoles(w)) {
      byRole[role].push({
        id: w.id,
        name: w.name,
        phone: w.phone,
        role,
        mainRole: w.role,
        rating: w.rating,
        zone: w.zone,
        recentEvents: recentByWorker.get(w.id) ?? 0,
        score: scores.get(w.id)!,
        available: said.has(w.id),
      });
    }
  }
  for (const role of ROLES) {
    byRole[role].sort(
      (a, b) => Number(b.available) - Number(a.available) || b.score.score - a.score.score || a.recentEvents - b.recentEvents || a.name.localeCompare(b.name),
    );
  }
  return byRole;
}

/** Huecos por cubrir por puesto: necesarios menos (confirmados + pendientes). */
export function gaps(event: Needs, assignments: { role: string; status: string }[]) {
  return Object.fromEntries(
    ROLES.map((role) => {
      const taken = assignments.filter((a) => a.role === role && ACTIVE_STATUSES.includes(a.status)).length;
      return [role, Math.max(0, needFor(event, role) - taken)];
    }),
  ) as Record<Role, number>;
}

export function coverage(event: Needs, assignments: { role: string; status: string }[]) {
  return ROLES.map((role) => {
    const of = (s: string) => assignments.filter((a) => a.role === role && a.status === s).length;
    return { role, need: needFor(event, role), confirmed: of("CONFIRMADO"), pending: of("CONVOCADO") };
  });
}

type EventInfo = { id: string; name: string; date: string; startTime: string; unloadTime: string | null };

const hhmm = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

/**
 * Aviso de convocatoria a cada trabajador, después de responder (no retrasa la pantalla). Se apunta
 * en cada convocatoria a qué móviles salió el aviso (o por qué no) para verlo en el evento.
 */
export function notifyInvited(event: EventInfo, invited: { workerId: string; role: string }[]) {
  if (!invited.length) return;
  later(async () => {
    for (const role of ROLES) {
      const ids = invited.filter((i) => i.role === role).map((i) => i.workerId);
      if (!ids.length) continue;
      const r = await notify({
        workerIds: ids,
        workerUrl: `/app/eventos/${event.id}`,
        title: "Nueva convocatoria",
        body: `${event.name} · ${formatDate(event.date)} a las ${callTime(event, role)} (${ROLE_LABEL[role].toLowerCase()}). Toca para aceptar o rechazar.`,
        tag: `inv-${event.id}`,
        emailFallback: true,
      }).catch((e) => {
        console.error("aviso convocatoria", e);
        return { sent: [], emailed: [] as string[] };
      });
      const now = new Date();
      for (const workerId of ids) {
        const mine = r.sent.filter((x) => x.device.workerId === workerId);
        const okTo = mine.filter((x) => x.ok).map((x) => x.device.label ?? "móvil");
        const errors = mine.filter((x) => !x.ok).map((x) => `${x.device.label ?? "móvil"}: ${x.error}`);
        const parts = [
          okTo.length && `✓ Aviso enviado a ${okTo.join(", ")} (${hhmm.format(now)})`,
          errors.length && `✗ ${errors.join(" · ")}`,
          !mine.length && "🔕 Sin móvil con avisos activados",
          r.emailed.includes(workerId) && "✉ enviado por email",
        ].filter(Boolean);
        await db.assignment.updateMany({
          where: { eventId: event.id, workerId },
          data: { notice: parts.join(" · ").slice(0, 500), noticeOk: okTo.length > 0, noticeAt: now },
        });
      }
    }
  });
}

/**
 * Convoca a los mejor puntuados hasta cubrir los huecos de los puestos indicados.
 * Se ejecuta con un bloqueo por evento para que dos rechazos simultáneos no convoquen de más.
 * Los puestos de más responsabilidad se cubren primero, y nadie se convoca dos veces.
 */
export async function fillGaps(eventId: string, roles: readonly Role[] = ROLES) {
  const invited: { workerId: string; role: Role; name: string }[] = [];
  const event = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      const ev = await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { assignments: true } });
      const missing = gaps(ev, ev.assignments);
      const candidates = await candidatesFor(ev);
      const picked = new Set<string>();
      const order: Role[] = ["MAITRE", "RESPONSABLE", "CAMARERO", "MOZO"];
      for (const role of order.filter((r) => roles.includes(r))) {
        let count = 0;
        for (const c of candidates[role]) {
          if (count >= missing[role]) break;
          if (picked.has(c.id)) continue;
          picked.add(c.id);
          await tx.assignment.create({ data: { eventId, workerId: c.id, role } });
          invited.push({ workerId: c.id, role, name: c.name });
          count++;
        }
      }
      return ev;
    },
    { timeout: 30_000 },
  );
  notifyInvited(event, invited);
  return { event, invited };
}

/**
 * Reposición automática: cuando alguien rechaza o se retira, se convoca al siguiente mejor
 * puntuado del mismo puesto (si el evento lo tiene activado, está abierto y no ha pasado).
 */
export async function autoReplace(eventId: string, role: Role, leaverName: string) {
  const ev = await db.event.findUnique({ where: { id: eventId } });
  if (!ev || !ev.autoReplace || ev.status !== "ABIERTO" || ev.date < today()) return;
  const { invited } = await fillGaps(eventId, [role]);
  const label = ROLE_LABEL[role].toLowerCase();
  await notify({
    admins: true,
    adminUrl: `/admin/eventos/${eventId}`,
    title: invited.length ? "🔁 Reposición automática" : "⚠ Sin sustituto",
    body: invited.length
      ? `${leaverName} no irá a ${ev.name}. Se ha convocado a ${invited.map((i) => i.name).join(", ")} (${label}).`
      : `${leaverName} no irá a ${ev.name} y no queda nadie libre como ${label} para sustituirle.`,
    tag: `repl-${eventId}`,
  });
}
