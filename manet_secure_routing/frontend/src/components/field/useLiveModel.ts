import { useMemo } from "react";
import type { Edge, SimEpoch, SimInit } from "../../lib/types";
import { EPOCH_MS, PHASES, PHASE_INDEX, type Phase } from "../../state/events";
import { useSettings } from "../../state/settings";
import { useSim } from "../../state/sim";
import { edgeKey, emptyModel, type FieldModel, type FieldNode } from "./model";

const DELIVER_SHARE = PHASES.find((p) => p.key === "deliver")!.share;

/**
 * Build what the map shows for the epoch on screen at its current phase.
 * Order matters: a node only turns "isolated" once the isolate phase shows the server-confirmed
 * blocked list; before that it is only "predicted malicious".
 */
export function buildLiveModel(init: SimInit, e: SimEpoch | undefined, prev: SimEpoch | undefined, phase: Phase | "done", iter: number, speed: number): FieldModel {
  const m = emptyModel(init.area, init.radio_range);
  const dests = new Set(init.destinations);
  const attackers = init.truth.attackers;
  const role = (i: number): FieldNode["role"] => (i === init.source ? "source" : dests.has(i) ? "destination" : "relay");

  if (!e) {
    m.nodes = init.positions.map((pos, id) => ({ id, pos, role: role(id), state: "healthy", inRoute: false, truth: attackers[id] }));
    m.links = init.edges;
    return m;
  }

  const pi = phase === "done" ? 5 : PHASE_INDEX[phase];
  const prevBlocked = new Set(prev?.isolate.blocked ?? []);
  const blocked = new Set(e.isolate.blocked);
  const isolatedNow = pi >= PHASE_INDEX.isolate ? blocked : prevBlocked;
  const flagged = new Set(e.detect.flagged);
  const suspicious = new Set(e.detect.suspicious);
  const prevRoute = prev?.route.edges ?? [];
  const invalid = new Set(e.isolate.invalidated.map(([a, b]) => edgeKey(a, b)));

  let route: Edge[] = [];
  if (pi >= PHASE_INDEX.route) route = e.route.edges;
  else if (pi === PHASE_INDEX.detect) route = prevRoute;
  else if (pi === PHASE_INDEX.isolate) route = prevRoute.filter(([a, b]) => !invalid.has(edgeKey(a, b)));
  const routeNodes = new Set(route.flat());

  const positions = pi >= PHASE_INDEX.deliver ? e.pos_end : e.pos_start;
  m.nodes = positions.map((pos, id) => {
    let state: FieldNode["state"] = "healthy";
    if (isolatedNow.has(id)) state = "isolated";
    else if (flagged.has(id)) state = "flagged";
    else if (suspicious.has(id)) state = "suspicious";
    return { id, pos, role: role(id), state, inRoute: routeNodes.has(id), score: e.detect.scores[id], truth: attackers[id] };
  });

  const touches = (set: Set<number>) => ([a, b]: Edge) => set.has(a) || set.has(b);
  if (pi === PHASE_INDEX.detect) {
    m.links = [...e.edges_safe, ...e.isolate.removed_edges.filter((ed) => !touches(prevBlocked)(ed))];
  } else if (pi >= PHASE_INDEX.deliver) {
    m.links = e.edges_end.filter((ed) => !touches(blocked)(ed));
  } else {
    m.links = e.edges_safe;
  }
  if (pi === PHASE_INDEX.isolate) {
    const newly = new Set([...blocked].filter((n) => !prevBlocked.has(n)));
    m.cutLinks = e.isolate.removed_edges.filter(touches(newly));
  }
  if (pi === PHASE_INDEX.isolate || pi === PHASE_INDEX.optimize) m.lostLinks = e.isolate.invalidated;
  if (pi === PHASE_INDEX.optimize) {
    const it = e.optimize.iterations[Math.min(iter, e.optimize.iterations.length - 1)];
    m.candidates = it ? it.candidates.map((c) => c.edges) : [];
  }
  m.route = route;
  m.routeKey = pi >= PHASE_INDEX.route ? `r${e.epoch}` : `r${e.epoch - 1}`;
  m.pulseKey = `p${e.epoch}`;
  if (pi === PHASE_INDEX.detect) m.pulse = e.detect.flagged.filter((n) => !(prev?.detect.flagged ?? []).includes(n));
  if (pi === PHASE_INDEX.deliver) {
    m.traffic = e.deliver.links.map(([from, to, forwarded, received]) => ({ from, to, forwarded, received }));
    m.trafficKey = `t${e.epoch}`;
    m.trafficMs = (EPOCH_MS * DELIVER_SHARE) / speed;
  }
  return m;
}

export function useLiveModel() {
  const init = useSim((s) => s.init);
  const epochs = useSim((s) => s.epochs);
  const cursor = useSim((s) => s.cursor);
  const phase = useSim((s) => s.phase);
  const iter = useSim((s) => s.iter);
  const speed = useSettings((s) => s.speed);
  return useMemo(
    () => (init ? buildLiveModel(init, epochs[cursor], epochs[cursor - 1], phase, iter, speed) : undefined),
    [init, epochs, cursor, phase, iter, speed],
  );
}

export function deliverMs(speed: number) {
  return (EPOCH_MS * DELIVER_SHARE) / speed;
}
