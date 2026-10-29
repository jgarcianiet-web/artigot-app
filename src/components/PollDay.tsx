"use client";

import { useState, useTransition } from "react";
import { answerPollAction } from "@/app/app/actions";
import { type DayAnswer, type Slot, SLOT_LABEL, SLOTS } from "@/lib/slots";

/** Un día del sondeo: «Puedo» abre las franjas (todo el día, mañana o tarde) y hay que elegir una. */
export function PollDay({ pollId, date, label, answer }: { pollId: string; date: string; label: string; answer: DayAnswer | null }) {
  const [value, setValue] = useState(answer);
  const [choosing, setChoosing] = useState(false);
  const [pending, start] = useTransition();
  const save = (a: DayAnswer) => {
    setValue(a);
    setChoosing(false);
    start(() => answerPollAction(pollId, date, a));
  };
  const can = value != null && value !== "NO";
  return (
    <li className="space-y-1.5 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>
          <span className="font-medium first-letter:uppercase">{label}</span>
          {can && !choosing && <span className="block text-xs text-emerald-700">✓ {SLOT_LABEL[value as Slot]}</span>}
        </span>
        <span className="flex gap-1.5">
          <button type="button" disabled={pending} onClick={() => setChoosing((c) => !c)} className={`btn btn-sm ${can || choosing ? "btn-success" : ""}`} aria-pressed={can} aria-expanded={choosing}>
            Puedo
          </button>
          <button type="button" disabled={pending} onClick={() => save("NO")} className={`btn btn-sm ${value === "NO" ? "border-stone-800 bg-stone-800 text-white" : ""}`} aria-pressed={value === "NO"}>
            No puedo
          </button>
        </span>
      </div>
      {choosing && (
        <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-200">
          <p className="mb-1.5 text-xs text-emerald-900">¿Cuándo puedes?</p>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {SLOTS.map((s) => (
              <button key={s} type="button" disabled={pending} onClick={() => save(s)} className={`btn btn-sm ${value === s ? "btn-success" : "bg-white"}`} aria-pressed={value === s}>
                {SLOT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
