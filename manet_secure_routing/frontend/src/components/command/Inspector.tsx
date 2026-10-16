import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, CircleX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PHASE_COLOR } from "../../lib/colors";
import { fmt } from "../../lib/format";
import type { Edge, SimEpoch, SimInit } from "../../lib/types";
import { KIND_LABEL, PHASE_INDEX } from "../../state/events";
import { useReducedMotion, useSettings } from "../../state/settings";
import { useSim, visibleEvents } from "../../state/sim";
import { edgeKey } from "../field/model";
import { Segmented, SeverityIcon } from "../ui/primitives";

type Tab = "node" | "link" | "route" | "optimizer";

export function Inspector() {
  const sim = useSim();
  const reduced = useReducedMotion();
  const sel = sim.selection;
  const [tab, setTab] = useState<Tab>("route");

  useEffect(() => {
    if (sel?.kind === "node") setTab("node");
    else if (sel?.kind === "link") setTab("link");
    else if (sel?.kind === "route") setTab("route");
  }, [sel]);
  // Follow the optimiser while it runs unless the user is inspecting something specific.
  useEffect(() => {
    if (sim.phase === "optimize" && !sel) setTab("optimizer");
    if (sim.phase === "route" && !sel) setTab("route");
  }, [sim.phase, sel]);

  const e = sim.epochs[sim.cursor];
  const prev = sim.epochs[sim.cursor - 1];
  const tabs: { value: Tab; label: string }[] = [
    ...(sel?.kind === "node" ? [{ value: "node" as Tab, label: `Node ${sel.id}` }] : []),
    ...(sel?.kind === "link" ? [{ value: "link" as Tab, label: "Link" }] : []),
    { value: "route", label: "Route" },
    { value: "optimizer", label: "Optimizer" },
  ];
  const active = tabs.some((t) => t.value === tab) ? tab : "route";

  return (
    <aside className="inspector panel" aria-label="Inspector">
      <div className="inspector__head">
        <Segmented label="Inspector view" value={active} onChange={setTab} options={tabs} />
        <div className="spacer" />
        {sel && (
          <button className="btn btn--ghost btn--icon btn--sm" onClick={() => sim.select(null)} aria-label="Clear selection" title="Clear selection">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="inspector__body">
        {!sim.init ? (
          <p className="secondary">Start a simulation to inspect nodes, links and routes.</p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active + (sel?.kind === "node" ? sel.id : "")}
              initial={reduced ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              {active === "node" && sel?.kind === "node" && <NodeView id={sel.id} init={sim.init} e={e} prev={prev} />}
              {active === "link" && sel?.kind === "link" && <LinkView edge={sel.edge} init={sim.init} e={e} />}
              {active === "route" && <RouteView init={sim.init} e={e} />}
              {active === "optimizer" && <OptimizerView e={e} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="insp-section">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ node

function NodeView({ id, init, e, prev }: { id: number; init: SimInit; e?: SimEpoch; prev?: SimEpoch }) {
  const sim = useSim();
  const showTruth = useSettings((s) => s.showTruth);
  const phaseIdx = sim.phase === "done" ? 5 : PHASE_INDEX[sim.phase];
  const isSource = id === init.source;
  const isDest = init.destinations.includes(id);
  const role = isSource ? "Multicast source" : isDest ? "Multicast destination" : "Relay";
  const events = visibleEvents(sim).filter((ev) => ev.nodes.includes(id)).slice(-6).reverse();

  const pos = e ? (phaseIdx >= PHASE_INDEX.deliver ? e.pos_end[id] : e.pos_start[id]) : init.positions[id];
  const blockedShown = e ? (phaseIdx >= PHASE_INDEX.isolate ? e.isolate.blocked : prev?.isolate.blocked ?? []) : [];
  const isolated = blockedShown.includes(id);
  const score = e?.detect.scores[id];
  const flows = e?.detect.flow_probs[id] ?? [];
  const flagged = e?.detect.flagged.includes(id) ?? false;
  const suspicious = e?.detect.suspicious.includes(id) ?? false;
  const neighbours = (e ? e.edges_safe : init.edges).filter(([a, b]) => a === id || b === id).length;
  const inRange = (e ? [...e.edges_safe, ...e.isolate.removed_edges] : init.edges).filter(([a, b]) => a === id || b === id).length;
  const cut = e?.isolate.removed_edges.filter(([a, b]) => a === id || b === id).length ?? 0;
  const energyEpoch = e?.deliver.node_energy[id];
  const energyTotal = sim.epochs.slice(0, sim.cursor + 1).reduce((s, x) => s + x.deliver.node_energy[id], 0);
  const routeEdges = e?.route.edges ?? [];
  const relayFor = init.destinations.filter((d) => pathTo(routeEdges, init.source, d)?.slice(1, -1).includes(id));

  const state = isolated ? ["Isolated", "chip--crit"] : flagged ? ["Predicted malicious", "chip--warn"] : suspicious ? ["Suspicious traffic", "chip--warn"] : ["Healthy", "chip--ok"];
  const decision = !e
    ? "No epoch has run yet."
    : flagged && (isSource || isDest)
      ? "Kept connected: the mitigation layer never isolates multicast members."
      : isolated
        ? `Isolated by the mitigation layer; ${cut} link${cut === 1 ? "" : "s"} removed from routing.`
        : flagged
          ? "Isolation pending: shown once the mitigation stage confirms it."
          : "No action. The node stays in the routing graph.";
  const truth = init.truth.attackers[String(id)];

  return (
    <div className="stack">
      <div className="insp-title">
        <div>
          <div className="insp-title__name">
            Node <span className="mono">{id}</span>
          </div>
          <div className="secondary">{role}</div>
        </div>
        <span className={`chip ${state[1]}`}>{state[0]}</span>
      </div>

      <Section title="MD-LSTM prediction">
        {score === undefined ? (
          <p className="secondary">Available after the first detection pass.</p>
        ) : (
          <>
            <ScoreBar score={score} threshold={init.threshold} />
            <FlowStrip flows={flows} />
            <p className="secondary small">
              {flows.filter((p) => p >= 0.5).length} of {flows.length} flows this epoch classified as attack traffic by the{" "}
              {init.ids_dataset === "nsl_kdd" ? "NSL-KDD" : init.ids_dataset === "kdd99" ? "KDD99" : "CICIDS2017"} model.
            </p>
          </>
        )}
      </Section>

      <Section title="Mitigation decision">
        <p className="secondary">{decision}</p>
        {showTruth && (
          <p className="truth-note">
            Simulator ground truth: {truth ? `${truth} attacker` : "benign node"}
          </p>
        )}
      </Section>

      <Section title="Telemetry">
        <dl className="kv">
          <dt>Position</dt>
          <dd>
            {pos[0].toFixed(1)}, {pos[1].toFixed(1)} m
          </dd>
          <dt>Speed</dt>
          <dd>{e ? `${e.speed[id].toFixed(1)} m/s` : "—"}</dd>
          <dt>Nodes in range</dt>
          <dd>{inRange}</dd>
          <dt>Usable links</dt>
          <dd>{neighbours}</dd>
          <dt>Energy this epoch</dt>
          <dd>{energyEpoch === undefined ? "—" : `${(energyEpoch * 1000).toFixed(2)} mJ`}</dd>
          <dt>Energy so far</dt>
          <dd>{e ? `${(energyTotal * 1000).toFixed(2)} mJ` : "—"}</dd>
          <dt>Relays for</dt>
          <dd>{relayFor.length ? relayFor.join(", ") : "—"}</dd>
        </dl>
      </Section>

      <Section title="History">
        {events.length === 0 ? (
          <p className="secondary">No events for this node yet.</p>
        ) : (
          <ul className="mini-events">
            {events.map((ev) => (
              <li key={ev.id}>
                <SeverityIcon severity={ev.severity} size={13} />
                <span className="mono muted">{fmt.simTime(ev.time_ms)}</span>
                <span>{KIND_LABEL[ev.kind]}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ScoreBar({ score, threshold }: { score: number; threshold: number }) {
  const color = score >= threshold ? "var(--warn)" : score >= 0.3 ? "#d9a54a" : "var(--teal)";
  return (
    <div className="score">
      <div className="score__row">
        <span className="score__value mono">{(score * 100).toFixed(1)}%</span>
        <span className="secondary small">mean attack probability</span>
      </div>
      <div className="score__track" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={score} aria-label="Attack probability">
        <div className="score__fill" style={{ width: `${score * 100}%`, background: color }} />
        <div className="score__thr" style={{ left: `${threshold * 100}%` }} title={`Isolation threshold ${threshold}`} />
      </div>
      <div className="score__scale small muted">
        <span>0</span>
        <span style={{ marginLeft: `calc(${threshold * 100}% - 34px)` }}>threshold {threshold}</span>
        <span style={{ marginLeft: "auto" }}>1</span>
      </div>
    </div>
  );
}

function FlowStrip({ flows }: { flows: number[] }) {
  return (
    <div className="flows" aria-label="Attack probability per flow">
      {flows.map((p, i) => (
        <span
          key={i}
          className="flows__bar"
          style={{ height: `${8 + p * 22}px`, background: p >= 0.5 ? "var(--warn)" : "var(--aqua)" }}
          title={`Flow ${i + 1}: ${(p * 100).toFixed(1)}%`}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ link

function LinkView({ edge, init, e }: { edge: Edge; init: SimInit; e?: SimEpoch }) {
  const [a, b] = edge;
  const pa = e ? e.pos_start[a] : init.positions[a];
  const pb = e ? e.pos_start[b] : init.positions[b];
  const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
  const key = edgeKey(a, b);
  const inRoute = e?.route.edges.some(([x, y]) => edgeKey(x, y) === key);
  const t = e?.deliver.links.find(([u, v]) => edgeKey(u, v) === key);
  const cut = e?.isolate.removed_edges.some(([x, y]) => edgeKey(x, y) === key);
  return (
    <div className="stack">
      <div className="insp-title">
        <div className="insp-title__name">
          Link <span className="mono">{a}–{b}</span>
        </div>
        <span className={`chip ${cut ? "chip--crit" : inRoute ? "chip--ok" : "chip--neutral"}`}>
          {cut ? "Cut by isolation" : inRoute ? "In route" : "Available"}
        </span>
      </div>
      <dl className="kv">
        <dt>Distance at epoch start</dt>
        <dd>{d.toFixed(1)} m</dd>
        <dt>Share of radio range</dt>
        <dd>{((d / init.radio_range) * 100).toFixed(0)}%</dd>
        <dt>Packets forwarded</dt>
        <dd>{t ? t[2] : "—"}</dd>
        <dt>Packets received</dt>
        <dd>{t ? t[3] : "—"}</dd>
      </dl>
      <p className="secondary small">
        Delivery probability falls with the fourth power of distance, so links near the edge of range lose more packets.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ route

export function pathTo(edges: Edge[], source: number, dest: number): number[] | null {
  const parent = new Map(edges.map(([u, v]) => [v, u]));
  const path = [dest];
  while (path[path.length - 1] !== source) {
    const p = parent.get(path[path.length - 1]);
    if (p === undefined || path.length > edges.length + 1) return null;
    path.push(p);
  }
  return path.reverse();
}

function RouteView({ init, e }: { init: SimInit; e?: SimEpoch }) {
  const sim = useSim();
  const phaseIdx = sim.phase === "done" ? 5 : PHASE_INDEX[sim.phase];
  if (!e) return <p className="secondary">The first route appears after epoch 1 is optimized.</p>;
  if (phaseIdx < PHASE_INDEX.route)
    return <p className="secondary">Epoch {e.epoch} is still being optimized. The validated route appears in the route stage.</p>;
  const o = e.route.objectives;
  const delivered = phaseIdx >= PHASE_INDEX.deliver;
  return (
    <div className="stack">
      <div className="insp-title">
        <div>
          <div className="insp-title__name">Multicast tree</div>
          <div className="secondary">
            Epoch {e.epoch}, {e.optimize.algorithm}
          </div>
        </div>
        <span className={`chip ${e.route.valid ? "chip--ok" : "chip--crit"}`}>
          {e.route.valid ? <CircleCheck size={12} /> : <CircleX size={12} />}
          {e.route.valid ? "Validated" : "Invalid"}
        </span>
      </div>

      <Section title="Paths">
        <ul className="paths">
          {init.destinations.map((d) => {
            const p = pathTo(e.route.edges, init.source, d);
            return (
              <li key={d}>
                <button className="paths__btn" onClick={() => p && sim.focusOn(p)}>
                  <span className="paths__dest">
                    To <span className="mono">{d}</span>
                  </span>
                  <span className="paths__seq mono">{p ? p.join(" → ") : "unreachable"}</span>
                  <span className="paths__hops muted">{p ? `${p.length - 1} hops` : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Expected by the optimizer">
        <dl className="kv">
          <dt>Reliability</dt>
          <dd>{fmt.pct(o.reliability)}</dd>
          <dt>Average hops</dt>
          <dd>{o.hops.toFixed(2)}</dd>
          <dt>Delay</dt>
          <dd>{fmt.ms(o.delay * 1000)}</dd>
          <dt>Energy per packet</dt>
          <dd>{(o.energy * 1000).toFixed(2)} mJ</dd>
          <dt>Fitness</dt>
          <dd>{e.optimize.fitness.toFixed(4)}</dd>
        </dl>
      </Section>

      <Section title="Measured this epoch">
        {delivered ? (
          <dl className="kv">
            <dt>Delivered</dt>
            <dd>
              {e.deliver.delivered} of {e.deliver.sent}
            </dd>
            <dt>Delivery ratio</dt>
            <dd>{fmt.pct(e.deliver.delivered / Math.max(1, e.deliver.sent))}</dd>
            <dt>Throughput</dt>
            <dd>{fmt.kbps(((e.deliver.delivered * 4096) / (init.epoch_ms / 1000)) / 1000)}</dd>
            <dt>Average delay</dt>
            <dd>{fmt.ms(e.deliver.delay_ms)}</dd>
            <dt>Energy</dt>
            <dd>{(e.deliver.energy * 1000).toFixed(1)} mJ</dd>
          </dl>
        ) : (
          <p className="secondary">Packets are sent in the delivery stage.</p>
        )}
      </Section>

      {e.route.problems.length > 0 && (
        <Section title="Validation notes">
          <ul className="secondary small">
            {e.route.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ optimiser

function OptimizerView({ e }: { e?: SimEpoch }) {
  const sim = useSim();
  const phaseIdx = sim.phase === "done" ? 5 : PHASE_INDEX[sim.phase];
  const iters = e?.optimize.iterations ?? [];
  const shownIter = phaseIdx > PHASE_INDEX.optimize ? iters.length - 1 : phaseIdx < PHASE_INDEX.optimize ? -1 : sim.iter;
  const cur = iters[shownIter];
  const hybrid = e?.optimize.algorithm === "HCDSO";
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    iters.slice(0, shownIter + 1).forEach((it) => (c[it.phase] = (c[it.phase] ?? 0) + 1));
    return c;
  }, [iters, shownIter]);

  if (!e) return <p className="secondary">Optimizer state streams in once the first epoch runs.</p>;
  if (shownIter < 0)
    return <p className="secondary">Waiting for detection and isolation to finish before optimizing epoch {e.epoch}.</p>;

  return (
    <div className="stack">
      <div className="insp-title">
        <div>
          <div className="insp-title__name">{e.optimize.algorithm}</div>
          <div className="secondary">
            Iteration <span className="mono">{shownIter + 1}</span> of {iters.length}
          </div>
        </div>
        {cur && (
          <span className="chip chip--violet" style={hybrid ? { background: "var(--tint-violet)", color: PHASE_COLOR[cur.phase] } : undefined}>
            {hybrid ? `${cur.phase} phase` : cur.phase}
          </span>
        )}
      </div>

      {hybrid && (
        <Section title="Phase per iteration">
          <div className="phase-strip" aria-label="COA or DSO step chosen at each iteration">
            {iters.map((it, i) => (
              <span
                key={i}
                className={`phase-strip__cell ${i === shownIter ? "is-current" : ""} ${i > shownIter ? "is-future" : ""}`}
                style={{ background: PHASE_COLOR[it.phase] }}
                title={`Iteration ${i + 1}: ${it.phase}`}
              />
            ))}
          </div>
          <p className="secondary small">
            COA {counts.COA ?? 0} · DSO {counts.DSO ?? 0} so far. HCDSO picks the step whose recent improvements were larger, and
            switches after five iterations without progress.
          </p>
        </Section>
      )}

      <Section title="Convergence">
        <Convergence iters={iters} upTo={shownIter} />
      </Section>

      <Section title="Best candidates now">
        <ol className="cands">
          {(cur?.candidates ?? []).map((c, i) => (
            <li key={i}>
              <span className={`cands__swatch cands__swatch--${i}`} aria-hidden="true" />
              <span>{i === 0 ? "Best" : `Runner-up ${i}`}</span>
              <span className="muted">{c.edges.length} links</span>
              <span className="mono" style={{ marginLeft: "auto" }}>
                {c.fitness.toFixed(4)}
              </span>
            </li>
          ))}
        </ol>
        <p className="secondary small">Fitness weighs energy, delay, hops and reliability; lower is better.</p>
      </Section>
    </div>
  );
}

function Convergence({ iters, upTo }: { iters: SimEpoch["optimize"]["iterations"]; upTo: number }) {
  const w = 280;
  const h = 96;
  if (!iters.length) return null;
  const vals = iters.flatMap((it) => [it.best, it.mean]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const x = (i: number) => 28 + (i / Math.max(1, iters.length - 1)) * (w - 36);
  const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (h - 26);
  const shown = iters.slice(0, upTo + 1);
  const line = (k: "best" | "mean") => shown.map((it, i) => `${x(i)},${y(it[k])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Best and mean population fitness per iteration">
      <line x1={28} x2={w - 8} y1={h - 18} y2={h - 18} stroke="var(--border-strong)" />
      <text x={24} y={y(max) + 3} textAnchor="end" className="axis-text">
        {max.toFixed(3)}
      </text>
      <text x={24} y={y(min) + 3} textAnchor="end" className="axis-text">
        {min.toFixed(3)}
      </text>
      <text x={28} y={h - 4} className="axis-text">
        it. 1
      </text>
      <text x={w - 8} y={h - 4} textAnchor="end" className="axis-text">
        {iters.length}
      </text>
      <polyline points={line("mean")} fill="none" stroke="var(--violet)" strokeWidth={1.4} strokeDasharray="3 3" />
      <polyline points={line("best")} fill="none" stroke="var(--teal)" strokeWidth={2} />
      {shown.length > 0 && <circle cx={x(shown.length - 1)} cy={y(shown[shown.length - 1].best)} r={3} fill="var(--teal)" />}
      <g className="axis-text">
        <line x1={100} x2={114} y1={h - 7} y2={h - 7} stroke="var(--teal)" strokeWidth={2} />
        <text x={118} y={h - 4}>best</text>
        <line x1={150} x2={164} y1={h - 7} y2={h - 7} stroke="var(--violet)" strokeDasharray="3 3" />
        <text x={168} y={h - 4}>population mean</text>
      </g>
    </svg>
  );
}
