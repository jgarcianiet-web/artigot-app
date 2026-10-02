import Link from "next/link";
import { privacySignature } from "@/lib/privacy";
import { incompleteWorkers } from "@/lib/completeness";
import { notFound } from "next/navigation";
import { accessText, mailEnabled } from "@/lib/mail";
import { EmailCode } from "./EmailCode";
import { AdminPhotoUpload } from "./AdminPhoto";
import { PhotoReview } from "@/components/PhotoReview";
import { PHOTO_STATUS } from "@/lib/photo";
import {
  addLoan,
  adminUploadDocument,
  deleteDocument,
  deleteLoan,
  returnLoan,
  verifyDocument,
  addUnavailability,
  deleteWorker,
  regenerateAccessCode,
  removeUnavailability,
  toggleWorkerActive,
} from "@/app/actions";
import { ConfirmButton, CopyButton, SubmitButton } from "@/components/client";
import { Empty, RoleBadge, ScoreBadge, Stars, StatusBadge } from "@/components/ui";
import { computeScores, CRITERIA, reviewAverage, SCORING } from "@/lib/scoring";
import { DocumentUploadForm } from "@/components/StaffForms";
import { DOC_LABEL, docState, formatIban } from "@/lib/staff";
import { db } from "@/lib/db";
import { CONTRACT_SHORT, euro, formatDate, isFixed, num, ownRatesText, today, workedHours } from "@/lib/domain";

const DEVICE_LABEL: Record<string, string> = { web: "Navegador / web app", fcm: "App Android", apns: "App iPhone" };

const Missing = () => <span className="text-amber-700">Falta</span>;

export default async function WorkerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string }> }) {
  const emailResult = (await searchParams).email;
  const t = today();
  const worker = await db.worker.findUnique({
    where: { id: (await params).id },
    include: {
      unavailabilities: { where: { date: { gte: t } }, orderBy: { date: "asc" } },
      assignments: { include: { event: true }, orderBy: { event: { date: "desc" } }, take: 50 },
      devices: { select: { kind: true } },
      documents: { orderBy: { createdAt: "desc" } },
      employments: { orderBy: { startDate: "desc" }, take: 20 },
      loans: { orderBy: [{ returnedAt: "asc" }, { deliveredAt: "desc" }] },
      reviews: {
        include: { event: { select: { id: true, name: true, date: true } }, reviewer: { select: { name: true } } },
        orderBy: { event: { date: "desc" } },
        take: 30,
      },
    },
  });
  if (!worker) notFound();
  const privacy = await privacySignature(worker.id);
  const missing = worker.active ? ((await incompleteWorkers([worker.id]))[0]?.missing ?? []) : [];

  const instructions = accessText(worker);
  const score = (await computeScores([worker.id], today())).get(worker.id)!;
  const criteriaAvg = CRITERIA.map((c) => {
    const vals = worker.reviews.map((r) => r[c.key]).filter((v): v is number => v != null);
    return { ...c, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
  const fmt = (n: number) => n.toFixed(1).replace(".", ",");
  const deviceKinds = [...new Set(worker.devices.map((d) => DEVICE_LABEL[d.kind] ?? d.kind))];

  return (
    <div className="space-y-6">
      {emailResult && (
        <p className={`rounded-lg p-3 text-sm ${emailResult === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {emailResult === "ok" ? `✓ Usuario creado y código de acceso enviado a ${worker.email}.` : `Usuario creado. ${emailResult}`}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="shrink-0 space-y-1 text-center">
            {worker.photoFileId ? (
              <a href={`/api/files/${worker.photoFileId}`} target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${worker.photoFileId}`} alt={`Foto de ${worker.name}`} className="size-20 rounded-full object-cover" />
              </a>
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full bg-stone-200 text-3xl" title="Sin foto">👤</div>
            )}
            {worker.photoStatus && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${PHOTO_STATUS[worker.photoStatus]?.cls ?? ""}`}>{PHOTO_STATUS[worker.photoStatus]?.label}</span>
            )}
          </div>
        <div>
          <h1>{worker.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <RoleBadge role={worker.role} />
            {worker.roles.filter((r) => r !== worker.role).map((r) => (
              <span key={r} className="opacity-70"><RoleBadge role={r} /></span>
            ))}
            <Stars value={worker.rating} />
            {worker.phone ? <a href={`tel:${worker.phone}`}>{worker.phone}</a> : <span className="text-amber-700">Sin teléfono (entra con su email)</span>}
            {worker.email && <span>· {worker.email}</span>}
            {worker.zone && <span>· {worker.zone}</span>}
            {!worker.active && <span className="font-medium text-red-600">· Inactivo</span>}
          </div>
          {worker.notes && <p className="mt-2 max-w-xl text-sm whitespace-pre-line text-stone-600">{worker.notes}</p>}
          <div className="mt-2 space-y-2">
            {worker.photoStatus === "PENDIENTE" && worker.photoFileId && <PhotoReview workerId={worker.id} />}
            {worker.photoStatus === "RECHAZADA" && worker.photoNote && <p className="text-xs text-red-700">Foto rechazada: {worker.photoNote}. Se le ha pedido otra.</p>}
            <AdminPhotoUpload id={worker.id} />
          </div>
        </div>
          </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/personal/${worker.id}/editar`} className="btn">Editar</Link>
          <form action={toggleWorkerActive.bind(null, worker.id)}>
            <SubmitButton className="btn">{worker.active ? "Dar de baja" : "Reactivar"}</SubmitButton>
          </form>
          <form action={deleteWorker.bind(null, worker.id)}>
            <ConfirmButton message="¿Eliminar definitivamente este trabajador y todo su historial?">Eliminar</ConfirmButton>
          </form>
        </div>
      </div>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>Puntuación para la selección automática</h2>
          <span className="text-3xl"><ScoreBadge score={score.score} /></span>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-stone-500">Calidad (valoraciones)</div>
            <div className="font-medium">{fmt(score.quality)} <span className="text-stone-500">· media {fmt(score.average)}/5 · {score.reviewCount} valoraciones</span></div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Fiabilidad (12 meses)</div>
            <div className={score.penalties.reliability ? "font-medium text-red-700" : "font-medium text-emerald-700"}>
              {score.penalties.reliability ? `−${score.penalties.reliability}` : "Sin incidencias"}
            </div>
            <div className="text-xs text-stone-500">{score.noShows} ausencias · {score.withdrawals} retiradas · {score.lates} retrasos</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Rotación (30 días)</div>
            <div className="font-medium">{score.penalties.rotation ? `−${score.penalties.rotation}` : "0"}</div>
            <div className="text-xs text-stone-500">{score.recentEvents} servicios recientes</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Por criterio</div>
            {criteriaAvg.map((c) => (
              <div key={c.key} className="flex justify-between text-xs">
                <span>{c.label}</span>
                <span className="font-medium">{c.avg == null ? "—" : fmt(c.avg)}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-stone-500">
          Las estrellas de RRHH ({worker.rating}/5) cuentan como {SCORING.PRIOR_WEIGHT} valoraciones de partida. Cada ausencia resta {SCORING.NO_SHOW_PENALTY},
          cada retirada tras confirmar {SCORING.WITHDRAWAL_PENALTY} y cada retraso de más de {SCORING.LATE_GRACE_MIN} min {SCORING.LATE_PENALTY}.
        </p>
        {worker.reviews.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Ver valoraciones ({worker.reviews.length})</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Maître</th>
                    <th className="text-center">Media</th>
                    <th>Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {worker.reviews.map((r) => {
                    const avg = reviewAverage(r);
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">
                          <Link href={`/admin/eventos/${r.event.id}`} className="link">{r.event.name}</Link>
                          <div className="text-xs text-stone-500">{formatDate(r.event.date)}</div>
                        </td>
                        <td>{r.reviewer.name}</td>
                        <td className="text-center font-semibold">
                          {r.noShow ? <span className="text-red-700">No se presentó</span> : avg != null && fmt(avg)}
                        </td>
                        <td className="text-sm text-stone-600">{r.comment}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section className="card space-y-3">
        <h2>Acceso a la app</h2>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs text-stone-500">Teléfono</div>
            <div className="font-medium">{worker.phone ?? <span className="text-amber-700">Sin teléfono: entra con {worker.email}</span>}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Código de acceso</div>
            <div className="font-mono text-2xl tracking-[0.3em]">{worker.accessCode}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Avisos activos en</div>
            <div className="text-sm">{deviceKinds.length ? deviceKinds.join(", ") : <span className="text-amber-700">ningún dispositivo todavía</span>}</div>
          </div>
        </div>
        {worker.lockedUntil && worker.lockedUntil > new Date() && (
          <p className="text-sm text-red-600">Bloqueado por intentos fallidos. Genera un código nuevo para desbloquearlo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <CopyButton text={instructions} label="Copiar instrucciones de acceso" />
          {worker.email && mailEnabled() && <EmailCode id={worker.id} email={worker.email} />}
          <form action={regenerateAccessCode.bind(null, worker.id)}>
            <ConfirmButton className="btn btn-sm" message="Se cerrará su sesión en todos sus dispositivos y tendrá que entrar con el código nuevo. ¿Continuar?">
              Generar código nuevo
            </ConfirmButton>
          </form>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2>Datos laborales</h2>
          {missing.length > 0 && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Falta: {missing.join(", ")}. Se le recuerda automáticamente.</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-stone-500">Protección de datos</dt>
            <dd>
              {privacy ? (
                <span className="text-emerald-700">✓ Firmada el {formatDate(privacy.signedAt!.toISOString().slice(0, 10))} · <a href={`/api/contracts/${privacy.id}/pdf`} target="_blank" className="link">PDF</a></span>
              ) : (
                <span className="text-amber-700">Sin firmar (se le pide al subir documentos)</span>
              )}
            </dd>
            <dt className="text-stone-500">DNI / NIE</dt><dd>{worker.dni ?? <Missing />}</dd>
            <dt className="text-stone-500">Seguridad Social</dt><dd>{worker.nss ?? <Missing />}</dd>
            <dt className="text-stone-500">IBAN</dt><dd className="font-mono text-xs">{worker.iban ? formatIban(worker.iban) : <Missing />}</dd>
            <dt className="text-stone-500">Nacimiento</dt><dd>{worker.birthDate ? formatDate(worker.birthDate, { long: true }) : <Missing />}</dd>
            <dt className="text-stone-500">Dirección</dt><dd>{worker.address ?? <Missing />}</dd>
            <dt className="text-stone-500">Contrato</dt>
            <dd>
              {CONTRACT_SHORT[worker.contractCode ?? "300"]}
              {isFixed(worker) && (worker.noClock ? " · no ficha" : " · ficha")}
              {isFixed(worker) && worker.monthlySalary != null && ` · nómina ${euro(worker.monthlySalary)}`}
            </dd>
            <dt className="text-stone-500">Código A3</dt><dd>{worker.a3Code ?? <Missing />}</dd>
            <dt className="text-stone-500">Tarifa propia</dt>
            <dd>
              {ownRatesText(worker.customRates) || <span className="text-stone-400">la de su puesto</span>}
            </dd>
          </dl>
          <p className="pt-1 text-xs"><Link href={`/admin/registro?id=${worker.id}`} className="link">Historial de cambios de esta ficha</Link></p>
          <h3 className="pt-2 font-semibold">Altas y bajas</h3>
          {worker.employments.length === 0 ? (
            <p className="text-sm text-stone-500">Sin altas registradas. <Link href="/admin/altas" className="link">Registrar</Link></p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {worker.employments.map((e) => (
                <li key={e.id} className="flex justify-between gap-2 py-1.5">
                  <span>{formatDate(e.startDate)} → {e.endDate ? formatDate(e.endDate) : "sin baja"}</span>
                  <span className="text-xs text-stone-500">{e.contractType}{e.startReported ? "" : " · alta sin comunicar"}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="pt-2 font-semibold">Documentos</h3>
          {worker.documents.length === 0 && <p className="text-sm text-stone-500">Sin documentos.</p>}
          <ul className="divide-y divide-stone-100 text-sm">
            {worker.documents.map((d) => {
              const st = docState(d.expiresAt, t);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{DOC_LABEL[d.type] ?? d.type}{d.label && ` · ${d.label}`}</div>
                    <div className="text-xs text-stone-500">
                      {d.expiresAt && (
                        <span className={st === "caducado" ? "font-medium text-red-700" : st === "caduca-pronto" ? "font-medium text-amber-700" : ""}>
                          {st === "caducado" ? "Caducado" : "Caduca"} el {formatDate(d.expiresAt)} ·{" "}
                        </span>
                      )}
                      subido por {d.uploadedBy}
                    </div>
                  </div>
                  {d.fileId && <a href={`/api/files/${d.fileId}`} target="_blank" className="btn btn-sm">Ver</a>}
                  {d.verified ? (
                    <span className="text-xs text-emerald-700">✓ Revisado</span>
                  ) : (
                    <form action={verifyDocument.bind(null, d.id)}><button className="btn btn-sm btn-success">Marcar revisado</button></form>
                  )}
                  <form action={deleteDocument.bind(null, d.id)}>
                    <ConfirmButton className="btn btn-sm btn-danger" message="¿Eliminar este documento?">✕</ConfirmButton>
                  </form>
                </li>
              );
            })}
          </ul>
          <DocumentUploadForm action={adminUploadDocument.bind(null, worker.id)} title="Añadir documento" />
        </section>

        <section className="card space-y-3">
          <h2>Material prestado</h2>
          {worker.loans.length === 0 && <p className="text-sm text-stone-500">No tiene material de la empresa.</p>}
          <ul className="divide-y divide-stone-100 text-sm">
            {worker.loans.map((l) => (
              <li key={l.id} className={`flex flex-wrap items-center gap-2 py-2 ${l.returnedAt ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.quantity > 1 && `${l.quantity} × `}{l.item}</div>
                  <div className="text-xs text-stone-500">
                    Entregado el {formatDate(l.deliveredAt)}
                    {l.returnedAt && ` · devuelto el ${formatDate(l.returnedAt)}`}
                    {l.notes && ` · ${l.notes}`}
                  </div>
                </div>
                {!l.returnedAt && (
                  <form action={returnLoan.bind(null, l.id)}><button className="btn btn-sm">Devuelto</button></form>
                )}
                <form action={deleteLoan.bind(null, l.id)}>
                  <ConfirmButton className="btn btn-sm btn-danger" message="¿Borrar este registro?">✕</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={addLoan.bind(null, worker.id)} className="grid grid-cols-[1fr_4rem] gap-2">
            <input name="item" className="input" placeholder="Material (p. ej. chaqueta negra)" required />
            <input name="quantity" type="number" min={1} defaultValue={1} className="input" aria-label="Cantidad" />
            <input name="deliveredAt" type="date" defaultValue={t} className="input" required aria-label="Fecha de entrega" />
            <SubmitButton className="btn">Registrar</SubmitButton>
            <input name="notes" className="input col-span-2" placeholder="Notas (talla, fianza…)" />
          </form>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className="card space-y-3">
          <h2>Días no disponibles</h2>
          <form action={addUnavailability.bind(null, worker.id)} className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Desde</label>
              <input type="date" name="from" min={t} className="input" required />
            </div>
            <div>
              <label className="label">Hasta (opcional)</label>
              <input type="date" name="to" min={t} className="input" />
            </div>
            <input name="reason" placeholder="Motivo (opcional)" className="input col-span-2" />
            <SubmitButton className="btn col-span-2">Añadir</SubmitButton>
          </form>
          {worker.unavailabilities.length === 0 ? (
            <p className="text-sm text-stone-500">Disponible todos los días próximos.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {worker.unavailabilities.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-1.5">
                  <span>
                    {formatDate(u.date)} {u.reason && <span className="text-stone-500">· {u.reason}</span>}
                  </span>
                  <form action={removeUnavailability.bind(null, u.id)}>
                    <button className="text-xs text-red-600 hover:underline">Quitar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3">
          <h2>Historial de servicios</h2>
          {worker.assignments.length === 0 ? (
            <Empty>Todavía no ha sido convocado a ningún evento.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Evento</th>
                    <th>Estado</th>
                    <th className="text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {worker.assignments.map((a) => {
                    const h = workedHours(a);
                    return (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap">{formatDate(a.event.date)}</td>
                        <td><Link href={`/admin/eventos/${a.eventId}`} className="link">{a.event.name}</Link></td>
                        <td><StatusBadge status={a.status} /></td>
                        <td className="text-right">{h != null ? num(h) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
