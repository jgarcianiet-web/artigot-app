import { reviewPhotoAction } from "@/app/actions";
import { PHOTO_REJECT_REASONS } from "@/lib/photo";

/** Aceptar o rechazar (con motivo) la foto de perfil de un trabajador. */
export function PhotoReview({ workerId }: { workerId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={reviewPhotoAction.bind(null, workerId, true)}><button className="btn btn-sm btn-success">✓ Aceptar</button></form>
      <form action={reviewPhotoAction.bind(null, workerId, false)} className="flex flex-1 items-center gap-1">
        <select name="reason" className="input py-1 text-xs" aria-label="Motivo del rechazo de la foto" defaultValue={PHOTO_REJECT_REASONS[0]}>
          {PHOTO_REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <button className="btn btn-sm btn-danger">Rechazar</button>
      </form>
    </div>
  );
}
