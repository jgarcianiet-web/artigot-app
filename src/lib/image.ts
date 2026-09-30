/** Reduce una foto en el navegador antes de subirla (máx. 1600 px, JPEG ~80 %). Uso solo en cliente. */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // formatos que el navegador no sabe abrir (p. ej. HEIC en escritorio): se sube tal cual
  }
}

/** Reduce las fotos de los campos indicados de un formulario antes de enviarlo. Uso solo en cliente. */
export async function shrinkFormImages(form: FormData, keys: string[], maxSide = 2000, quality = 0.85) {
  for (const k of keys) {
    const f = form.get(k);
    if (f instanceof File && f.size > 0 && f.type.startsWith("image/")) form.set(k, await shrinkImage(f, maxSide, quality));
  }
}
