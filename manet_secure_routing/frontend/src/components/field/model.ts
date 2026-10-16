import type { Edge, Vec2 } from "../../lib/types";

export type NodeRole = "source" | "destination" | "relay";
export type NodeState = "healthy" | "suspicious" | "flagged" | "isolated";

export interface FieldNode {
  id: number;
  pos: Vec2;
  role: NodeRole;
  state: NodeState;
  inRoute: boolean;
  score?: number;
  truth?: "blackhole" | "grayhole";
}

export interface TrafficLink {
  from: number;
  to: number;
  forwarded: number;
  received: number;
}

/** Everything the field draws. Builders turn simulator payloads into this; the field never invents state. */
export interface FieldModel {
  area: number;
  radioRange: number;
  nodes: FieldNode[];
  links: Edge[]; // usable links
  cutLinks: Edge[]; // removed by isolation this epoch
  lostLinks: Edge[]; // last route's links that are no longer usable
  candidates: Edge[][]; // optimiser population's best distinct trees, best first
  route: Edge[]; // final multicast tree (parent -> child)
  routeKey: string; // changes when a new route should be traced
  pulseKey: string; // changes when detection pulses should replay
  pulse: number[]; // nodes to pulse (new IDS detections)
  traffic: TrafficLink[];
  trafficKey: string;
  trafficMs: number;
}

export const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function emptyModel(area = 800, radioRange = 250): FieldModel {
  return {
    area, radioRange, nodes: [], links: [], cutLinks: [], lostLinks: [], candidates: [], route: [],
    routeKey: "", pulseKey: "", pulse: [], traffic: [], trafficKey: "", trafficMs: 0,
  };
}

/** Depth of each node in a parent->child edge list rooted at `root` (for staggered route tracing). */
export function depths(route: Edge[], root: number) {
  const kids = new Map<number, number[]>();
  for (const [u, v] of route) kids.set(u, [...(kids.get(u) ?? []), v]);
  const d = new Map<number, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of kids.get(u) ?? []) {
      if (!d.has(v)) {
        d.set(v, d.get(u)! + 1);
        queue.push(v);
      }
    }
  }
  return d;
}
