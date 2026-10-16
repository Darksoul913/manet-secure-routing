import { useState } from "react";
import type { Layers } from "./TopologyField";

const sw = { width: 16, height: 16, viewBox: "-8 -8 16 16", "aria-hidden": true } as const;

function Glyph({ kind }: { kind: string }) {
  switch (kind) {
    case "source":
      return (
        <svg {...sw}>
          <rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" rx={1} fill="var(--teal)" />
        </svg>
      );
    case "dest":
      return (
        <svg {...sw}>
          <circle r={4} fill="var(--teal)" />
          <circle r={6.5} fill="none" stroke="var(--teal)" strokeWidth={1.3} />
        </svg>
      );
    case "relay":
      return (
        <svg {...sw}>
          <circle r={4.5} fill="var(--node-relay)" />
        </svg>
      );
    case "flagged":
      return (
        <svg {...sw}>
          <circle r={5} fill="var(--warn)" />
          <path d="M0,-2.8V0.6M0,2.2v0.01" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      );
    case "isolated":
      return (
        <svg {...sw}>
          <circle r={5} fill="var(--crit)" />
          <path d="M-2.4,-2.4L2.4,2.4M2.4,-2.4L-2.4,2.4" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      );
    case "route":
      return (
        <svg {...sw}>
          <line x1={-7} x2={7} y1={0} y2={0} stroke="var(--teal)" strokeWidth={3} strokeLinecap="round" />
        </svg>
      );
    case "cand":
      return (
        <svg {...sw}>
          <line x1={-7} x2={7} y1={0} y2={0} stroke="var(--indigo)" strokeWidth={2} />
        </svg>
      );
    default:
      return null;
  }
}

const ITEMS = [
  ["source", "Source"],
  ["dest", "Destination"],
  ["relay", "Relay"],
  ["flagged", "Predicted malicious"],
  ["isolated", "Isolated"],
  ["route", "Selected route"],
  ["cand", "Optimizer candidate"],
] as const;

const LAYERS: [keyof Layers, string][] = [
  ["links", "Links"],
  ["candidates", "Candidates"],
  ["packets", "Packets"],
  ["labels", "Node IDs"],
  ["truth", "Ground truth"],
];

export function Legend({ layers, onToggle, compact }: { layers: Layers; onToggle: (k: keyof Layers) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="legend">
      {!compact && open && (
        <div className="legend__items">
          {ITEMS.map(([k, label]) => (
            <span key={k} className="legend__item">
              <Glyph kind={k} />
              {label}
            </span>
          ))}
        </div>
      )}
      <div className={`legend__layers ${open ? "" : "legend__layers--solo"}`} role="group" aria-label="Map layers">
        {!compact && (
          <button className="legend__toggle legend__key" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide key" : "Key"}
          </button>
        )}
        {LAYERS.map(([k, label]) => (
          <button
            key={k}
            className="legend__toggle"
            aria-pressed={layers[k]}
            onClick={() => onToggle(k)}
            title={k === "truth" ? "Outline the simulator's real attackers (not visible to the IDS)" : undefined}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
