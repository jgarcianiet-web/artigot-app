"use client";

import { ActionForm } from "@/components/client";
import { useActionState, useState } from "react";
import { saveReviews, type ReviewResult } from "@/app/app/actions";
import { RoleBadge } from "@/components/ui";
import { CRITERIA, type CriterionKey } from "@/lib/scoring";

type Member = {
  workerId: string;
  name: string;
  role: string;
  existing: (Partial<Record<CriterionKey, number | null>> & { noShow: boolean; comment: string | null }) | null;
};

function Stars({ name, initial, disabled }: { name: string; initial: number | null; disabled: boolean }) {
  const [value, setValue] = useState(initial ?? 0);
  return (
    <div className="flex gap-0.5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={`cursor-pointer text-2xl leading-none ${disabled ? "opacity-30" : ""}`}>
          <input
            type="radio"
            name={name}
            value={n}
            defaultChecked={initial === n}
            disabled={disabled}
            className="sr-only"
            onChange={() => setValue(n)}
            aria-label={`${n} de 5`}
          />
          <span className={n <= value ? "text-amber-500" : "text-stone-300"}>★</span>
        </label>
      ))}
    </div>
  );
}

function MemberCard({ m }: { m: Member }) {
  const [noShow, setNoShow] = useState(m.existing?.noShow ?? false);
  return (
    <div className={`card space-y-3 ${m.existing ? "border-emerald-300" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{m.name}</div>
          <RoleBadge role={m.role} />
        </div>
        {m.existing && <span className="text-xs font-medium text-emerald-700">✓ Valorado</span>}
      </div>
      <label className="flex items-center gap-2 text-sm text-red-700">
        <input
          type="checkbox"
          name={`noShow_${m.workerId}`}
          value="1"
          defaultChecked={noShow}
          onChange={(e) => setNoShow(e.target.checked)}
          className="size-4"
        />
        No se presentó
      </label>
      <div className="space-y-2">
        {CRITERIA.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2">
            <span className={`text-sm ${noShow ? "text-stone-400" : ""}`}>{c.label}</span>
            <Stars name={`${c.key}_${m.workerId}`} initial={m.existing?.[c.key] ?? null} disabled={noShow} />
          </div>
        ))}
      </div>
      <textarea
        name={`comment_${m.workerId}`}
        defaultValue={m.existing?.comment ?? ""}
        placeholder="Comentario para RRHH (opcional)"
        maxLength={500}
        rows={2}
        className="input text-base sm:text-sm"
      />
    </div>
  );
}

export function ReviewForm({ eventId, members }: { eventId: string; members: Member[] }) {
  const [result, action, pending] = useActionState<ReviewResult | null, FormData>(saveReviews.bind(null, eventId), null);
  return (
    <ActionForm action={action} className="space-y-3">
      {members.map((m) => (
        <MemberCard key={m.workerId} m={m} />
      ))}
      {result && (
        <p role="status" className={`rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {result.message}
        </p>
      )}
      <button className="btn btn-primary sticky bottom-16 w-full py-3 text-base shadow-lg" disabled={pending}>
        {pending ? "Guardando…" : "Guardar valoraciones"}
      </button>
    </ActionForm>
  );
}
