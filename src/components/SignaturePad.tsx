"use client";

import { useEffect, useRef, useState } from "react";

/** Recuadro para firmar con el dedo o el ratón. Devuelve la firma como PNG (data URL) en un campo oculto. */
export function SignaturePad({ name = "signature" }: { name?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState("");
  const drawing = useRef(false);
  const strokes = useRef(0);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1917";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-stone-300 bg-white"
        aria-label="Recuadro para firmar"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d")!;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          if (!drawing.current) return;
          drawing.current = false;
          strokes.current++;
          setValue(strokes.current >= 1 ? e.currentTarget.toDataURL("image/png") : "");
        }}
      />
      <input type="hidden" name={name} value={value} />
      <div className="flex justify-between text-xs text-stone-500">
        <span>Firma con el dedo dentro del recuadro</span>
        <button
          type="button"
          className="underline"
          onClick={() => {
            const c = canvas.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            strokes.current = 0;
            setValue("");
          }}
        >
          Borrar
        </button>
      </div>
    </div>
  );
}
