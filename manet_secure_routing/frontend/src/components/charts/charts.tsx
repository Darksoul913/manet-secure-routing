import { useState } from "react";
import type { Confusion } from "../../lib/types";

export const AXIS = { fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--mono)" };
export const GRID = { stroke: "var(--border)", strokeDasharray: "0", vertical: false };

interface TipPayload {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

/** Recharts tooltip body: text stays in ink colours, a swatch carries series identity. */
export function ChartTooltip({
  active, payload, label, labelFormat, valueFormat,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  labelFormat?: (l: string | number) => string;
  valueFormat?: (v: number, key?: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ctip">
      {label !== undefined && <div className="ctip__label">{labelFormat ? labelFormat(label) : label}</div>}
      {payload.map((p) => (
        <div className="ctip__row" key={String(p.dataKey ?? p.name)}>
          <span className="ctip__sw" style={{ background: p.color }} />
          <span className="ctip__name">{p.name}</span>
          <span className="ctip__val mono">{typeof p.value === "number" ? (valueFormat ? valueFormat(p.value, p.dataKey) : p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SeriesLegend({ items }: { items: { name: string; color: string; dim?: boolean; onClick?: () => void }[] }) {
  return (
    <div className="slegend" role="list">
      {items.map((it) =>
        it.onClick ? (
          <button key={it.name} role="listitem" className={`slegend__item ${it.dim ? "is-dim" : ""}`} onClick={it.onClick} aria-pressed={!it.dim}>
            <span className="slegend__sw" style={{ background: it.color }} />
            {it.name}
          </button>
        ) : (
          <span key={it.name} role="listitem" className="slegend__item">
            <span className="slegend__sw" style={{ background: it.color }} />
            {it.name}
          </span>
        ),
      )}
    </div>
  );
}

/**
 * Dot plot for scores that all sit near 1: one row per metric, one dot per model.
 * A zoomed axis keeps 0.1-point differences visible without implying bars from zero.
 */
export function DotPlot({
  rows, series, colors, format,
}: {
  rows: { label: string; values: Record<string, number> }[];
  series: string[];
  colors: Record<string, string>;
  format: (v: number) => string;
}) {
  const [hover, setHover] = useState<{ row: string; s: string; v: number; x: number; y: number } | null>(null);
  const all = rows.flatMap((r) => series.map((s) => r.values[s])).filter((v) => v != null);
  const lo = Math.max(0, Math.floor((Math.min(...all) - 0.005) * 100) / 100);
  const hi = Math.min(1, Math.ceil((Math.max(...all) + 0.002) * 100) / 100);
  const W = 560;
  const rowH = 44;
  const left = 92;
  const right = 30;
  const H = rows.length * rowH + 28;
  const x = (v: number) => left + ((v - lo) / (hi - lo || 1)) * (W - left - right);
  const ticks = Array.from({ length: 6 }, (_, i) => lo + ((hi - lo) * i) / 5);
  return (
    <div className="dotplot" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Model scores per metric">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={4} y2={H - 22} stroke="var(--border)" />
            <text x={x(t)} y={H - 6} textAnchor="middle" style={AXIS}>
              {format(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = 18 + i * rowH;
          const vals = series.map((s) => r.values[s]).filter((v) => v != null);
          return (
            <g key={r.label}>
              <text x={0} y={cy + 4} style={{ fill: "var(--text-2)", fontSize: 12.5 }}>
                {r.label}
              </text>
              <line x1={x(Math.min(...vals))} x2={x(Math.max(...vals))} y1={cy} y2={cy} stroke="var(--border-strong)" strokeWidth={2} />
              {series.map((s, si) => {
                const v = r.values[s];
                if (v == null) return null;
                const dy = (si - (series.length - 1) / 2) * 5.5; // dodge so near-equal scores stay visible
                return (
                  <g key={s}>
                    <circle
                      cx={x(v)}
                      cy={cy + dy}
                      r={hover?.row === r.label && hover.s === s ? 6 : 4.5}
                      fill={colors[s]}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                    <circle
                      cx={x(v)}
                      cy={cy + dy}
                      r={9}
                      fill="transparent"
                      onPointerEnter={() => setHover({ row: r.label, s, v, x: x(v), y: cy + dy })}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="ctip dotplot__tip" style={{ left: `${(hover.x / W) * 100}%`, top: hover.y + 14 }}>
          <div className="ctip__row">
            <span className="ctip__sw" style={{ background: colors[hover.s] }} />
            <span className="ctip__name">{hover.s}</span>
            <span className="ctip__val mono">{format(hover.v)}</span>
          </div>
          <div className="ctip__label">{hover.row}</div>
        </div>
      )}
    </div>
  );
}

export function ConfusionMatrix({ c, model }: { c: Confusion; model: string }) {
  const total = c.tp + c.fn + c.fp + c.tn;
  const cells = [
    { k: "tp", label: "Attack caught", sub: "true positive", v: c.tp, good: true },
    { k: "fn", label: "Attack missed", sub: "false negative", v: c.fn, good: false },
    { k: "fp", label: "False alarm", sub: "false positive", v: c.fp, good: false },
    { k: "tn", label: "Benign passed", sub: "true negative", v: c.tn, good: true },
  ];
  const actualPos = c.tp + c.fn;
  const actualNeg = c.fp + c.tn;
  return (
    <div className="cm" role="table" aria-label={`Confusion matrix for ${model}`}>
      <div className="cm__corner" role="presentation" />
      <div className="cm__colhead" role="columnheader">Predicted attack</div>
      <div className="cm__colhead" role="columnheader">Predicted benign</div>
      {[0, 1].map((row) => (
        <div key={row} className="cm__row" role="row">
          <div className="cm__rowhead" role="rowheader">
            {row === 0 ? "Actual attack" : "Actual benign"}
            <span className="mono muted small">{(row === 0 ? actualPos : actualNeg).toLocaleString()}</span>
          </div>
          {cells.slice(row * 2, row * 2 + 2).map((cell) => {
            const share = cell.v / (row === 0 ? actualPos : actualNeg);
            // Sequential teal for correct cells, light coral for errors; the label says which.
            const bg = cell.good ? `rgba(8,127,140,${0.1 + share * 0.38})` : `rgba(198,77,77,${Math.min(0.45, 0.08 + share * 4)})`;
            return (
              <div key={cell.k} className="cm__cell" role="cell" style={{ background: bg }}>
                <span className="cm__value mono">{cell.v.toLocaleString()}</span>
                <span className="cm__label">{cell.label}</span>
                <span className="cm__share mono">{(share * 100).toFixed(2)}% of row</span>
              </div>
            );
          })}
        </div>
      ))}
      <p className="cm__foot secondary small">
        {total.toLocaleString()} held-out test flows. Counts are recovered exactly from the recorded FPR and FNR and the test split's class sizes.
      </p>
    </div>
  );
}
