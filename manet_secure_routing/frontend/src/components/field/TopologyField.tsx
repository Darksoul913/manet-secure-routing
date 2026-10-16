import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge } from "../../lib/types";
import type { Selection } from "../../state/sim";
import { depths, edgeKey, type FieldModel, type FieldNode } from "./model";
import { Particles } from "./Particles";
import "./field.css";

export interface Layers {
  links: boolean;
  candidates: boolean;
  packets: boolean;
  labels: boolean;
  truth: boolean;
}

interface Props {
  model: FieldModel;
  selection?: Selection;
  onSelect?: (s: Selection) => void;
  focus?: { nodes: number[]; nonce: number };
  layers: Layers;
  reduced: boolean;
  nodeMoveMs?: number;
  interactive?: boolean;
  ariaLabel: string;
  children?: React.ReactNode; // overlays (legend, toolbars)
}

const STATE_LABEL: Record<FieldNode["state"], string> = {
  healthy: "Healthy",
  suspicious: "Suspicious traffic",
  flagged: "Predicted malicious",
  isolated: "Isolated",
};

export function TopologyField({
  model, selection, onSelect, focus, layers, reduced, nodeMoveMs = 0, interactive = true, ariaLabel, children,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const [k, setK] = useState(1);
  const [hover, setHover] = useState<{ node?: number; edge?: Edge; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { area, radioRange } = model;
  const pad = area * 0.07;
  const viewBox: [number, number, number, number] = [-pad, -pad, area + pad * 2, area + pad * 2];
  const R = area / 115;
  const glyph = 1 / Math.sqrt(k);
  const pos = useMemo(() => new Map(model.nodes.map((n) => [n.id, n.pos])), [model.nodes]);
  const byId = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);
  const source = model.nodes.find((n) => n.role === "source");
  const routeDepth = useMemo(() => (source ? depths(model.route, source.id) : new Map<number, number>()), [model.route, source]);
  const routeSet = useMemo(() => new Set(model.route.map(([a, b]) => edgeKey(a, b))), [model.route]);
  const maxDepth = Math.max(1, ...routeDepth.values());

  // ---- zoom & pan
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.7, 8])
      .on("zoom", (ev) => {
        sceneRef.current?.setAttribute("transform", ev.transform.toString());
        setK(ev.transform.k);
      });
    select(svg).call(z).on("dblclick.zoom", null);
    zoomRef.current = z;
    return () => {
      select(svg).on(".zoom", null);
    };
  }, [interactive]);

  const applyTransform = useCallback(
    (t: ReturnType<typeof zoomIdentity.scale>) => {
      const svg = svgRef.current;
      const z = zoomRef.current;
      if (!svg || !z) return;
      if (reduced) select(svg).call(z.transform, t);
      else select(svg).transition().duration(650).call(z.transform, t);
    },
    [reduced],
  );

  const fitTo = useCallback(
    (ids?: number[]) => {
      const pts = (ids?.length ? ids.map((i) => pos.get(i)).filter(Boolean) : model.nodes.map((n) => n.pos)) as [number, number][];
      if (!pts.length) return applyTransform(zoomIdentity);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const minSpan = radioRange * 1.6;
      const bw = Math.max(minSpan, Math.max(...xs) - Math.min(...xs));
      const bh = Math.max(minSpan, Math.max(...ys) - Math.min(...ys));
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      const [vx, vy, vw, vh] = viewBox;
      const kk = Math.min(6, Math.max(1, 0.85 * Math.min(vw / bw, vh / bh)));
      applyTransform(zoomIdentity.translate(vx + vw / 2 - kk * cx, vy + vh / 2 - kk * cy).scale(kk));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pos, model.nodes, applyTransform, radioRange, area],
  );

  useEffect(() => {
    if (focus?.nodes.length) fitTo(focus.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  const zoomBy = (f: number) => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) select(svg).transition().duration(reduced ? 0 : 250).call(zoomRef.current.scaleBy, f);
  };

  // ---- hover tooltip, positioned in wrapper coordinates
  const onHover = (e: React.PointerEvent, h: { node?: number; edge?: Edge }) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setHover({ ...h, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const selNode = selection?.kind === "node" ? selection.id : undefined;
  const selEdge = selection?.kind === "link" ? edgeKey(...selection.edge) : undefined;
  const ringNode = hover?.node ?? selNode;
  const line = (a: number, b: number) => {
    const p = pos.get(a);
    const q = pos.get(b);
    return p && q ? { x1: p[0], y1: p[1], x2: q[0], y2: q[1] } : null;
  };

  const grid = [];
  const step = area >= 1200 ? 200 : 100;
  for (let v = 0; v <= area + 0.01; v += step) grid.push(v);

  return (
    <div className="field" ref={wrapRef} onPointerLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        className="field__svg"
        viewBox={viewBox.join(" ")}
        role="img"
        aria-label={ariaLabel}
        onClick={(e) => {
          if (e.target === svgRef.current) onSelect?.(null);
        }}
      >
        <rect x={-pad} y={-pad} width={area + 2 * pad} height={area + 2 * pad} fill="transparent" />
        <g ref={sceneRef}>
          {/* Survey graticule: real metres of the simulation area */}
          <g className="field__grid" aria-hidden="true">
            <rect x={0} y={0} width={area} height={area} className="field__area" />
            {grid.map((v, i) => (
              <g key={v}>
                <line x1={v} y1={0} x2={v} y2={area} className={i % 2 ? "minor" : "major"} />
                <line x1={0} y1={v} x2={area} y2={v} className={i % 2 ? "minor" : "major"} />
                {i % 2 === 0 && (
                  <>
                    <text x={v} y={-pad * 0.35} className="field__tick" textAnchor="middle" style={{ fontSize: area / 70 }}>
                      {v}
                    </text>
                    <text x={-pad * 0.3} y={v} className="field__tick" textAnchor="end" dominantBaseline="middle" style={{ fontSize: area / 70 }}>
                      {v}
                    </text>
                  </>
                )}
              </g>
            ))}
            <text x={area} y={area + pad * 0.6} textAnchor="end" className="field__tick" style={{ fontSize: area / 70 }}>
              metres
            </text>
            <g transform={`translate(0 ${area + pad * 0.45})`}>
              <line x1={0} x2={100} y1={0} y2={0} className="field__scale" />
              <line x1={0} x2={0} y1={-area / 160} y2={area / 160} className="field__scale" />
              <line x1={100} x2={100} y1={-area / 160} y2={area / 160} className="field__scale" />
              <text x={50} y={pad * 0.3} textAnchor="middle" className="field__tick" style={{ fontSize: area / 75 }}>
                100 m
              </text>
            </g>
          </g>

          {ringNode !== undefined && pos.get(ringNode) && (
            <g aria-hidden="true">
              <circle cx={pos.get(ringNode)![0]} cy={pos.get(ringNode)![1]} r={radioRange} className="field__range" />
              <text
                x={pos.get(ringNode)![0]}
                y={pos.get(ringNode)![1] - radioRange - area / 120}
                textAnchor="middle"
                className="field__range-label"
                style={{ fontSize: area / 68 }}
              >
                {radioRange} m radio range
              </text>
            </g>
          )}

          {layers.links && (
            <g className="field__links">
              {model.links.map(([a, b]) => {
                const l = line(a, b);
                const key = edgeKey(a, b);
                if (!l || routeSet.has(key)) return null;
                const touchSel = selNode !== undefined && (a === selNode || b === selNode);
                return (
                  <line
                    key={key}
                    {...l}
                    className={`link ${touchSel ? "link--near" : ""} ${selEdge === key ? "link--selected" : ""}`}
                  />
                );
              })}
            </g>
          )}

          <AnimatePresence>
            {model.cutLinks.map(([a, b]) => {
              const l = line(a, b);
              return (
                l && (
                  <motion.line
                    key={`cut-${model.pulseKey}-${edgeKey(a, b)}`}
                    {...l}
                    className="link--cut"
                    initial={{ opacity: 0.95, pathLength: 1 }}
                    animate={{ opacity: reduced ? 0.35 : [0.95, 0.95, 0.35], pathLength: reduced ? 1 : [1, 1, 0.5] }}
                    transition={{ duration: reduced ? 0 : 1.1, times: [0, 0.3, 1], ease: "easeInOut" }}
                    exit={{ opacity: 0 }}
                  />
                )
              );
            })}
          </AnimatePresence>

          {model.lostLinks.map(([a, b]) => {
            const l = line(a, b);
            return l && <line key={`lost-${edgeKey(a, b)}`} {...l} className="link--lost" />;
          })}

          {layers.candidates &&
            model.candidates
              .slice(0, 3)
              .reverse()
              .map((edges, ri, arr) => {
                const rank = arr.length - 1 - ri;
                return (
                  <g key={`cand-${rank}`} className={`cand cand--${rank}`} aria-hidden="true">
                    {edges.map(([a, b]) => {
                      const l = line(a, b);
                      return l && <line key={edgeKey(a, b)} {...l} />;
                    })}
                  </g>
                );
              })}

          <g className="field__route">
            {model.route.map(([a, b]) => {
              const l = line(a, b);
              if (!l) return null;
              const d = routeDepth.get(b) ?? 1;
              const key = edgeKey(a, b);
              return (
                <g key={`${model.routeKey}-${key}`}>
                  <motion.line
                    {...l}
                    className={`route ${selEdge === key || selection?.kind === "route" ? "route--selected" : ""}`}
                    initial={reduced ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.32, delay: ((d - 1) / maxDepth) * 0.55, ease: "easeOut" }}
                  />
                  {interactive && (
                    <line
                      {...l}
                      className="hit"
                      onPointerMove={(e) => onHover(e, { edge: [a, b] })}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => onSelect?.({ kind: "route" })}
                    />
                  )}
                </g>
              );
            })}
          </g>

          {interactive && layers.links && (
            <g>
              {model.links.map(([a, b]) => {
                const l = line(a, b);
                const key = edgeKey(a, b);
                if (!l || routeSet.has(key)) return null;
                return (
                  <line
                    key={`hit-${key}`}
                    {...l}
                    className="hit"
                    onPointerMove={(e) => onHover(e, { edge: [a, b] })}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => onSelect?.({ kind: "link", edge: [a, b] })}
                  />
                );
              })}
            </g>
          )}

          {layers.packets && model.traffic.length > 0 && (
            <Particles
              traffic={model.traffic}
              positions={model.nodes.map((n) => n.pos)}
              durationMs={reduced ? 0 : model.trafficMs}
              runKey={model.trafficKey}
              radius={R * 0.42 * glyph}
            />
          )}

          <g className="field__nodes">
            {model.nodes.map((n) => (
              <NodeGlyph
                key={n.id}
                n={n}
                R={R}
                scale={glyph}
                selected={selNode === n.id}
                pulse={model.pulse.includes(n.id) ? model.pulseKey : undefined}
                showTruth={layers.truth}
                reduced={reduced}
                moveMs={nodeMoveMs}
                label={layers.labels || hover?.node === n.id || selNode === n.id}
                onHover={interactive ? (e) => onHover(e, { node: n.id }) : undefined}
                onLeave={() => setHover(null)}
                onSelect={interactive ? () => onSelect?.({ kind: "node", id: n.id }) : undefined}
                area={area}
              />
            ))}
          </g>
        </g>
      </svg>

      {hover && interactive && <Tooltip hover={hover} byId={byId} pos={pos} routeSet={routeSet} radioRange={radioRange} traffic={model.traffic} />}

      {interactive && (
        <div className="field__controls" role="toolbar" aria-label="Map view">
          <button className="btn btn--icon btn--sm" onClick={() => zoomBy(1.4)} aria-label="Zoom in" title="Zoom in">
            <Plus size={14} />
          </button>
          <button className="btn btn--icon btn--sm" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out" title="Zoom out">
            <Minus size={14} />
          </button>
          <button className="btn btn--icon btn--sm" onClick={() => fitTo()} aria-label="Fit all nodes" title="Fit all nodes">
            <Maximize2 size={13} />
          </button>
          <button className="btn btn--icon btn--sm" onClick={() => applyTransform(zoomIdentity)} aria-label="Reset view" title="Reset view">
            <RotateCcw size={13} />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

function NodeGlyph({
  n, R, scale, selected, pulse, showTruth, reduced, moveMs, label, onHover, onLeave, onSelect, area,
}: {
  n: FieldNode;
  R: number;
  scale: number;
  selected: boolean;
  pulse?: string;
  showTruth: boolean;
  reduced: boolean;
  moveMs: number;
  label: boolean;
  onHover?: (e: React.PointerEvent) => void;
  onLeave: () => void;
  onSelect?: () => void;
  area: number;
}) {
  const r = (n.role === "relay" ? R : R * 1.25) * scale;
  const cls = `node node--${n.state} node--${n.role} ${n.inRoute ? "node--route" : ""} ${selected ? "node--selected" : ""}`;
  const name = `Node ${n.id}, ${n.role}, ${STATE_LABEL[n.state].toLowerCase()}`;
  return (
    <g
      className={cls}
      style={{
        transform: `translate(${n.pos[0]}px, ${n.pos[1]}px)`,
        transition: reduced || !moveMs ? undefined : `transform ${moveMs}ms linear`,
      }}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? "button" : undefined}
      aria-label={name}
      aria-pressed={onSelect ? selected : undefined}
      onPointerMove={onHover}
      onPointerLeave={onLeave}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {pulse && !reduced && (
        <motion.circle
          key={pulse}
          r={r}
          className="node__pulse"
          initial={{ scale: 1, opacity: 0.75 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut", repeat: 1, repeatDelay: 0.1 }}
        />
      )}
      {selected && <circle r={r + R * 0.75 * scale} className="node__halo" />}
      {n.role === "source" ? (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" rx={r * 0.18} className="node__body" />
      ) : (
        <circle r={r} className="node__body" />
      )}
      {n.role === "destination" && <circle r={r + R * 0.45 * scale} className="node__ring" />}
      {n.state === "isolated" && (
        <motion.path
          d={`M${-r * 0.5},${-r * 0.5}L${r * 0.5},${r * 0.5}M${r * 0.5},${-r * 0.5}L${-r * 0.5},${r * 0.5}`}
          className="node__mark"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4 }}
        />
      )}
      {(n.state === "flagged" || n.state === "suspicious") && (
        <path d={`M0,${-r * 0.55}V${r * 0.12}M0,${r * 0.42}v0.01`} className="node__mark" />
      )}
      {showTruth && n.truth && (
        <rect
          x={-r - R * 0.9 * scale}
          y={-r - R * 0.9 * scale}
          width={(r + R * 0.9 * scale) * 2}
          height={(r + R * 0.9 * scale) * 2}
          className="node__truth"
        />
      )}
      {label && (
        <text y={-r - R * 0.7 * scale} textAnchor="middle" className="node__label" style={{ fontSize: (area / 62) * scale }}>
          {n.id}
        </text>
      )}
    </g>
  );
}

function Tooltip({
  hover, byId, pos, routeSet, radioRange, traffic,
}: {
  hover: { node?: number; edge?: Edge; x: number; y: number };
  byId: Map<number, FieldNode>;
  pos: Map<number, [number, number]>;
  routeSet: Set<string>;
  radioRange: number;
  traffic: FieldModel["traffic"];
}) {
  let body: React.ReactNode = null;
  if (hover.node !== undefined) {
    const n = byId.get(hover.node);
    if (!n) return null;
    body = (
      <>
        <div className="tip__title">
          Node <span className="mono">{n.id}</span>
          <span className="tip__role">{n.role}</span>
        </div>
        <div className="tip__row">{STATE_LABEL[n.state]}</div>
        {n.score !== undefined && (
          <div className="tip__row">
            Attack probability <span className="mono">{(n.score * 100).toFixed(1)}%</span>
          </div>
        )}
        <div className="tip__row muted mono">
          {n.pos[0].toFixed(0)}, {n.pos[1].toFixed(0)} m
        </div>
      </>
    );
  } else if (hover.edge) {
    const [a, b] = hover.edge;
    const p = pos.get(a)!;
    const q = pos.get(b)!;
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const t = traffic.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
    body = (
      <>
        <div className="tip__title">
          Link <span className="mono">{a}–{b}</span>
          {routeSet.has(edgeKey(a, b)) && <span className="tip__role">in route</span>}
        </div>
        <div className="tip__row">
          <span className="mono">{d.toFixed(0)} m</span> apart, {((d / radioRange) * 100).toFixed(0)}% of range
        </div>
        {t && (
          <div className="tip__row">
            {t.received} of {t.forwarded} packets received
          </div>
        )}
      </>
    );
  }
  return (
    <div className="tip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="tooltip">
      {body}
    </div>
  );
}
