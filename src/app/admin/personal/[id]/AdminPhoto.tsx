"use client";

import { startTransition, useActionState } from "react";
import { adminUploadPhoto } from "@/app/actions";
import { shrinkImage } from "@/lib/image";

/** RRHH puede subir la foto (queda aceptada directamente). */
export function AdminPhotoUpload({ id }: { id: string }) {
  const [msg, run, pending] = useActionState(adminUploadPhoto.bind(null, id), null);
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const file = form.get("photo");
        if (file instanceof File && file.size) form.set("photo", await shrinkImage(file, 900, 0.85));
        startTransition(() => run(form));
      }}
    >
      <input type="file" name="photo" accept="image/*" required className="max-w-56 text-xs" aria-label="Foto de perfil" />
      <button className="btn btn-sm" disabled={pending}>{pending ? "Subiendo…" : "Subir foto"}</button>
      {msg && <span className="text-stone-600">{msg}</span>}
    </form>
  );
}
