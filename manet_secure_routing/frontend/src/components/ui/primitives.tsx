import { motion } from "motion/react";
import { AlertTriangle, CircleCheck, Info, OctagonAlert } from "lucide-react";
import { useId } from "react";
import { useReducedMotion } from "../../state/settings";
import type { Severity } from "../../state/events";

export function Segmented<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && (
            <motion.div
              layoutId={`seg-${id}`}
              className="segmented__thumb"
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Sparkline({ values, width = 64, height = 18, color = "var(--teal)" }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}

export function Skeleton({ h = 16, w = "100%", style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}

export function LoadingBlock({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div className="stack" role="status" aria-label={label} style={{ gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={i === 0 ? 22 : 14} w={i === 0 ? "40%" : `${90 - i * 12}%`} />
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {children && <div style={{ maxWidth: 420 }}>{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice--warn" role="alert">
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>{message}</div>
      {onRetry && (
        <button className="btn btn--sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export const SEVERITY_ICON: Record<Severity, typeof Info> = {
  critical: OctagonAlert,
  warning: AlertTriangle,
  info: Info,
  success: CircleCheck,
};

export const SEVERITY_CHIP: Record<Severity, string> = {
  critical: "chip--crit",
  warning: "chip--warn",
  info: "chip--info",
  success: "chip--ok",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
  success: "OK",
};

export function SeverityIcon({ severity, size = 14 }: { severity: Severity; size?: number }) {
  const Icon = SEVERITY_ICON[severity];
  const color = { critical: "var(--crit)", warning: "var(--warn)", info: "var(--info)", success: "var(--ok)" }[severity];
  return <Icon size={size} color={color} aria-label={SEVERITY_LABEL[severity]} style={{ flexShrink: 0 }} />;
}
