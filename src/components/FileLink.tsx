"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Enlace a un documento o una foto. En la app del personal se abre encima de la misma pantalla, con
 * «Volver» (también vale el botón o gesto de atrás del móvil): en la app y en la web instalada no
 * hay botón de atrás del navegador, abrir el archivo suelto dejaba a la persona sin poder volver y
 * se perdía lo que estuviera escribiendo. En RRHH se abre en otra pestaña.
 */
export function FileLink({ href, title, className, children }: { href: string; title?: string; className?: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (!path?.startsWith("/app")) return <a href={href} target="_blank" className={className}>{children}</a>;
  return (
    <>
      <a
        href={href}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </a>
      {open && <DocViewer src={href} title={title ?? "Documento"} onClose={() => setOpen(false)} />}
    </>
  );
}

type State = { kind: "loading" } | { kind: "image"; url: string } | { kind: "pdf"; pages: number } | { kind: "other"; url: string } | { kind: "error"; url?: string };

/** Visor a pantalla completa: fotos y PDF (dibujado página a página: la app del móvil no abre PDFs). */
function DocViewer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const pagesBox = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Una entrada en el historial: «atrás» en el móvil cierra el visor en vez de salir de la pantalla
  useEffect(() => {
    window.history.pushState({ viewer: true }, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (cancelled) return;
      if (blob.type.startsWith("image/") || blob.type !== "application/pdf") {
        objectUrl = URL.createObjectURL(blob);
        return setState({ kind: blob.type.startsWith("image/") ? "image" : "other", url: objectUrl });
      }
      objectUrl = URL.createObjectURL(blob);
      const fallback = objectUrl;
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
      // Sin worker aparte: el lector del PDF corre en la propia página
      const g = globalThis as { pdfjsWorker?: unknown };
      g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise.catch(() => null);
      if (!doc) return !cancelled && setState({ kind: "error", url: fallback });
      if (cancelled) return;
      setState({ kind: "pdf", pages: doc.numPages });
      const box = pagesBox.current;
      if (!box) return;
      const width = box.clientWidth || 360;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: (width * ratio) / page.getViewport({ scale: 1 }).width });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "w-full rounded-md bg-white shadow-sm";
        canvas.setAttribute("aria-label", `Página ${i}`);
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        if (cancelled) return;
        box.appendChild(canvas);
      }
    })().catch(() => !cancelled && setState({ kind: "error" }));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const close = () => window.history.back(); // dispara popstate, que cierra el visor

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-stone-100 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-2">
        <button type="button" onClick={close} className="btn btn-sm">‹ Volver</button>
        <h2 className="min-w-0 truncate text-base">{title}</h2>
      </div>
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 overflow-y-auto p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {state.kind === "loading" && <p className="text-sm text-stone-500">Cargando…</p>}
        {state.kind === "error" && <p className="text-sm text-red-700">No se ha podido abrir el documento{state.url ? " aquí" : ". Inténtalo de nuevo"}.</p>}
        {state.kind === "error" && state.url && <a href={state.url} download className="btn">Descargar</a>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {state.kind === "image" && <img src={state.url} alt={title} className="w-full rounded-md bg-white object-contain shadow-sm" />}
        {state.kind === "other" && <a href={state.url} download className="btn">Descargar</a>}
        {state.kind === "pdf" && state.pages > 30 && <p className="text-xs text-stone-500">Se muestran las 30 primeras páginas de {state.pages}.</p>}
        <div ref={pagesBox} className="space-y-3" />
        {state.kind !== "loading" && <button type="button" onClick={close} className="btn w-full">‹ Volver</button>}
      </div>
    </div>
  );
}
