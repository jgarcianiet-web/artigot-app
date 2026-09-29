import { ROLE_LABEL, STATUS_LABEL, type Role } from "@/lib/domain";

const STATUS_STYLE: Record<string, string> = {
  CONVOCADO: "bg-amber-100 text-amber-800",
  CONFIRMADO: "bg-emerald-100 text-emerald-800",
  RECHAZADO: "bg-red-100 text-red-700",
  CANCELADO: "bg-stone-200 text-stone-600",
};

const ROLE_STYLE: Record<string, string> = {
  CAMARERO: "bg-sky-100 text-sky-800",
  MAITRE: "bg-violet-100 text-violet-800",
  MOZO: "bg-orange-100 text-orange-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? ""}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_STYLE[role] ?? ""}`}>
      {ROLE_LABEL[role as Role] ?? role}
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="whitespace-nowrap text-amber-500" title={`Valoración ${value}/5`}>
      {"★".repeat(value)}
      <span className="text-stone-300">{"★".repeat(5 - value)}</span>
    </span>
  );
}

/** Barra de cobertura: verde confirmados, ámbar pendientes, gris hueco. */
export function CoverageBar({ need, confirmed, pending }: { need: number; confirmed: number; pending: number }) {
  if (need === 0) return <div className="h-2 rounded-full bg-stone-100" />;
  const pct = (n: number) => `${Math.min(100, (n / need) * 100)}%`;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-stone-200">
      <div className="bg-emerald-500" style={{ width: pct(confirmed) }} />
      <div className="bg-amber-400" style={{ width: pct(Math.min(pending, Math.max(0, need - confirmed))) }} />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">{children}</p>;
}
