import { reviewPhotoAction } from "@/app/actions";

/** Aceptar o rechazar (con motivo) la foto de perfil de un trabajador. */
export function PhotoReview({ workerId }: { workerId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={reviewPhotoAction.bind(null, workerId, true)}><button className="btn btn-sm btn-success">✓ Aceptar</button></form>
      <form action={reviewPhotoAction.bind(null, workerId, false)} className="flex flex-1 items-center gap-1">
        <input name="reason" required maxLength={200} className="input min-w-0 flex-1 py-1 text-xs" aria-label="Motivo del rechazo de la foto" placeholder="Motivo del rechazo (lo verá el trabajador)" />
        <button className="btn btn-sm btn-danger">Rechazar</button>
      </form>
    </div>
  );
}
