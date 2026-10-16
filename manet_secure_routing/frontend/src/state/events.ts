import { fmt } from "../lib/format";
import type { Edge, SimEpoch, SimInit } from "../lib/types";

export const EPOCH_MS = 4200; // on-screen playback length of one epoch at 1x
export const REDUCED_EPOCH_MS = 900;

export type Phase = "detect" | "isolate" | "optimize" | "route" | "deliver";
export const PHASES: { key: Phase; label: string; share: number }[] = [
  { key: "detect", label: "Detect", share: 0.14 },
  { key: "isolate", label: "Isolate", share: 0.14 },
  { key: "optimize", label: "Optimize", share: 0.36 },
  { key: "route", label: "Route", share: 0.12 },
  { key: "deliver", label: "Deliver", share: 0.24 },
];
export const PHASE_INDEX: Record<Phase, number> = { detect: 0, isolate: 1, optimize: 2, route: 3, deliver: 4 };

export type Severity = "critical" | "warning" | "info" | "success";

export interface SimEvent {
  id: string;
  epoch: number;
  time_ms: number;
  phase: Phase;
  kind:
    | "anomaly"
    | "predicted"
    | "mitigation"
    | "isolated"
    | "withheld"
    | "released"
    | "invalidated"
    | "opt_started"
    | "candidate"
    | "validated"
    | "delivered";
  severity: Severity;
  title: string;
  detail: string;
  nodes: number[];
  edges?: Edge[];
  target: "node" | "route" | "none";
}

export const KIND_LABEL: Record<SimEvent["kind"], string> = {
  anomaly: "Traffic anomaly",
  predicted: "Malicious node predicted",
  mitigation: "Mitigation requested",
  isolated: "Isolation confirmed",
  withheld: "Isolation withheld",
  released: "Node reconnected",
  invalidated: "Route links lost",
  opt_started: "Optimization started",
  candidate: "Candidate route updated",
  validated: "Route validated",
  delivered: "Packets delivered",
};

/** Derive the event stream for one epoch from what the server reported. Nothing here is synthesised. */
export function eventsForEpoch(init: SimInit, e: SimEpoch, prev?: SimEpoch): SimEvent[] {
  const out: SimEvent[] = [];
  const t0 = e.time_ms - init.epoch_ms; // detection and routing happen at the start of the epoch
  const push = (ev: Omit<SimEvent, "id" | "epoch">) => out.push({ ...ev, id: `${e.epoch}-${out.length}`, epoch: e.epoch });
  const group = new Set([init.source, ...init.destinations]);
  const prevFlagged = new Set(prev?.detect.flagged ?? []);
  const prevSusp = new Set(prev?.detect.suspicious ?? []);
  const prevBlocked = new Set(prev?.isolate.blocked ?? []);
  const blocked = new Set(e.isolate.blocked);

  for (const n of e.detect.suspicious) {
    if (prevSusp.has(n)) continue;
    push({
      time_ms: t0, phase: "detect", kind: "anomaly", severity: "warning", nodes: [n], target: "node",
      title: `Node ${n} traffic looks anomalous`,
      detail: `Mean attack probability ${fmt.pct(e.detect.scores[n])}, below the ${fmt.pct(init.threshold, 0)} isolation threshold.`,
    });
  }
  const newlyFlagged = e.detect.flagged.filter((n) => !prevFlagged.has(n));
  for (const n of newlyFlagged) {
    push({
      time_ms: t0, phase: "detect", kind: "predicted", severity: "critical", nodes: [n], target: "node",
      title: `MD-LSTM flags node ${n}`,
      detail: `Mean attack probability ${fmt.pct(e.detect.scores[n])} over ${e.detect.flow_probs[n].length} flows.`,
    });
  }
  if (newlyFlagged.length) {
    push({
      time_ms: t0, phase: "isolate", kind: "mitigation", severity: "info", nodes: newlyFlagged, target: "node",
      title: `Isolation requested for ${newlyFlagged.length} node${newlyFlagged.length > 1 ? "s" : ""}`,
      detail: `Nodes ${newlyFlagged.join(", ")} scored at or above the threshold.`,
    });
  }
  for (const n of e.isolate.blocked) {
    if (prevBlocked.has(n)) continue;
    const cut = e.isolate.removed_edges.filter(([a, b]) => a === n || b === n);
    push({
      time_ms: t0, phase: "isolate", kind: "isolated", severity: "critical", nodes: [n], edges: cut, target: "node",
      title: `Node ${n} isolated`,
      detail: `${cut.length} link${cut.length === 1 ? "" : "s"} removed from the routing graph.`,
    });
  }
  for (const n of e.detect.flagged) {
    if (group.has(n) && !blocked.has(n) && !prevFlagged.has(n)) {
      push({
        time_ms: t0, phase: "isolate", kind: "withheld", severity: "warning", nodes: [n], target: "node",
        title: `Node ${n} kept connected`,
        detail: "It is the source or a multicast destination, which the mitigation layer never isolates.",
      });
    }
  }
  for (const n of prevBlocked) {
    if (!blocked.has(n)) {
      push({
        time_ms: t0, phase: "isolate", kind: "released", severity: "info", nodes: [n], target: "node",
        title: `Node ${n} reconnected`, detail: "Its attack probability fell below the threshold this epoch.",
      });
    }
  }
  if (e.isolate.invalidated.length) {
    const nodes = [...new Set(e.isolate.invalidated.flat())];
    push({
      time_ms: t0, phase: "isolate", kind: "invalidated", severity: "warning", nodes, edges: e.isolate.invalidated, target: "route",
      title: `${e.isolate.invalidated.length} link${e.isolate.invalidated.length > 1 ? "s" : ""} of the last route unusable`,
      detail: "Broken by isolation or by node movement; the route is being recomputed.",
    });
  }
  const iters = e.optimize.iterations;
  push({
    time_ms: t0, phase: "optimize", kind: "opt_started", severity: "info", nodes: [], target: "route",
    title: `${e.optimize.algorithm} optimizing the multicast tree`,
    detail: `${iters.length} iterations on the safe subgraph (${e.edges_safe.length} usable links).`,
  });
  let improvements = 0;
  for (let i = 1; i < iters.length; i++) if (iters[i].best < iters[i - 1].best - 1e-9) improvements++;
  if (iters.length) {
    push({
      time_ms: t0, phase: "optimize", kind: "candidate", severity: "info", nodes: [], target: "route",
      title: `Best candidate improved ${improvements} time${improvements === 1 ? "" : "s"}`,
      detail: `Fitness ${iters[0].best.toFixed(4)} → ${iters[iters.length - 1].best.toFixed(4)} (lower is better).`,
    });
  }
  const o = e.route.objectives;
  push({
    time_ms: t0, phase: "route", kind: "validated", severity: e.route.valid ? "success" : "critical", nodes: [init.source, ...init.destinations],
    edges: e.route.edges, target: "route",
    title: e.route.valid
      ? o.unreachable
        ? `Route validated, ${o.unreachable} destination${o.unreachable > 1 ? "s" : ""} unreachable`
        : "Route validated"
      : "Route failed validation",
    detail: `${fmt.num(o.hops, 1)} hops on average, expected reliability ${fmt.pct(o.reliability)}.`,
  });
  push({
    time_ms: e.time_ms, phase: "deliver", kind: "delivered", severity: e.deliver.delivered === e.deliver.sent ? "success" : "info",
    nodes: [], target: "route",
    title: `${e.deliver.delivered} of ${e.deliver.sent} packets delivered`,
    detail: `Epoch delay ${fmt.ms(e.deliver.delay_ms)}, energy ${fmt.joules(e.deliver.energy, 3)}.`,
  });
  return out;
}
