"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EnablePushButton } from "./PushSetup";

type Step = { key: string; title: string; text: string; done: boolean };
type PushConfig = { webPublicKey: string | null; fcm: boolean; apns: boolean };

/** Bienvenida guiada: los pasos que necesita una persona nueva, en orden, con su progreso. */
export function Onboarding({ name, steps, push, signAction }: { name: string; steps: Step[]; push: PushConfig; signAction: () => Promise<void> }) {
  const router = useRouter();
  const done = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done)?.key;
  // El paso de los avisos se puede posponer (p. ej. en un ordenador o un navegador sin avisos)
  const [skipped, setSkipped] = useState(false);
  useEffect(() => {
    try {
      setSkipped(localStorage.getItem("artigot-avisos-luego") === "1");
    } catch {}
  }, []);
  if (current === "avisos" && skipped) return null;
  return (
    <section className="card space-y-3 border-stone-300">
      <div>
        <h2>👋 ¡Hola, {name}! Bienvenido/a a Artigot</h2>
        <p className="text-sm text-stone-600">Antes de tu primer servicio, completa estos pasos. Te llevará unos minutos.</p>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-stone-500"><span>{done} de {steps.length} pasos</span><span>{Math.round((done / steps.length) * 100)} %</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className={`flex gap-3 rounded-lg p-2 ${s.key === current ? "bg-stone-100" : ""}`}>
            <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.done ? "bg-emerald-600 text-white" : s.key === current ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-600"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className={`text-sm font-medium ${s.done ? "text-stone-500 line-through" : ""}`}>{s.title}</p>
              {s.key === current && (
                <>
                  <p className="text-xs text-stone-600">{s.text}</p>
                  {s.key === "rgpd" && <form action={signAction}><button className="btn btn-primary btn-sm">Leer y firmar</button></form>}
                  {s.key === "datos" && <Link href="/app/perfil" className="btn btn-primary btn-sm">Completar mis datos</Link>}
                  {s.key === "avisos" && (
                    <div className="flex flex-wrap items-start gap-3">
                      <EnablePushButton config={push} onDone={() => router.refresh()} />
                      <button
                        type="button"
                        className="pt-1 text-xs text-stone-500 underline"
                        onClick={() => {
                          try {
                            localStorage.setItem("artigot-avisos-luego", "1");
                          } catch {}
                          setSkipped(true);
                        }}
                      >
                        Ahora no
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
