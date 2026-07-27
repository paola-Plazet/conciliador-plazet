// Componentes de presentación reutilizables

import type { ConciliationStatus } from "@/lib/types";

const STATUS_STYLE: Record<ConciliationStatus, { label: string; cls: string }> = {
  CUADRA: { label: "Cuadra", cls: "bg-plazet-100 text-plazet-800" },
  DIFERENCIA: { label: "Diferencia", cls: "bg-amber-100 text-amber-800" },
  SIN_CONCILIAR: { label: "Sin conciliar", cls: "bg-rose-100 text-rose-700" },
  MANUAL: { label: "Manual", cls: "bg-sky-100 text-sky-800" },
};

export function StatusBadge({ status }: { status: ConciliationStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function LateBadge({ days }: { days: number }) {
  if (!days || days <= 0) return null;
  return (
    <span className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
      +{days}d tarde
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-plazet-100 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const tones = {
    default: "text-plazet-900",
    good: "text-plazet-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  return (
    <Card>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</div>
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-plazet-100 bg-white px-8 py-5">
      <div>
        <h1 className="text-xl font-bold text-plazet-950">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
