import { motion } from "motion/react";
import { Check, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Legend } from "../components/field/Legend";
import { TopologyField } from "../components/field/TopologyField";
import { deliverMs, useLiveModel } from "../components/field/useLiveModel";
import { ErrorNotice, LoadingBlock } from "../components/ui/primitives";
import { api } from "../lib/api";
import { ALGO_NAME } from "../lib/colors";
import { DATASET_LABEL, fmt } from "../lib/format";
import type { SimDefaults, SimParams } from "../lib/types";
import { useConnection, useResource } from "../state/connection";
import { useReducedMotion, useSettings } from "../state/settings";
import { useSim } from "../state/sim";
import { useLayers } from "./CommandCenter";

const PRESETS: { id: string; label: string; note: string; patch: Partial<SimParams> }[] = [
  { id: "baseline", label: "Baseline", note: "The configuration used for the recorded experiments", patch: {} },
  { id: "dense", label: "Dense urban", note: "90 nodes, short 200 m radios, walking speed", patch: { n_nodes: 90, radio_range: 200, mean_speed: 3 } },
  { id: "sparse", label: "Sparse rural", note: "35 nodes over 1.2 km with 300 m radios", patch: { n_nodes: 35, area: 1200, radio_range: 300, mean_speed: 15 } },
  { id: "attack", label: "Heavy attack", note: "30% of relays are blackhole or grayhole attackers", patch: { malicious_fraction: 0.3 } },
  { id: "fast", label: "Vehicular", note: "Nodes move at 30 m/s on average", patch: { mean_speed: 30 } },
];

type NumKey = Exclude<keyof SimParams, "algorithm" | "ids_dataset">;

const GROUPS: { title: string; fields: { key: NumKey; label: string; step: number; fmt: (v: number) => string; hint?: string }[] }[] = [
  {
    title: "Network",
    fields: [
      { key: "n_nodes", label: "Nodes", step: 1, fmt: (v) => `${v}` },
      { key: "area", label: "Area side", step: 50, fmt: (v) => `${v} m` },
      { key: "radio_range", label: "Radio range", step: 10, fmt: (v) => `${v} m` },
      { key: "n_destinations", label: "Multicast destinations", step: 1, fmt: (v) => `${v}`, hint: "Capped at a quarter of the nodes." },
    ],
  },
  {
    title: "Threats",
    fields: [
      { key: "malicious_fraction", label: "Attacker share", step: 0.01, fmt: (v) => fmt.pct(v, 0) },
      { key: "threshold", label: "Isolation threshold", step: 0.05, fmt: (v) => v.toFixed(2), hint: "Mean attack probability at which a node is cut off." },
    ],
  },
  {
    title: "Mobility and traffic",
    fields: [
      { key: "mean_speed", label: "Mean speed", step: 0.5, fmt: (v) => `${v} m/s`, hint: "Gauss–Markov mobility; positions update every 100 ms epoch." },
      { key: "packet_rate", label: "Packet rate", step: 10, fmt: (v) => `${v} pkt/s` },
    ],
  },
  {
    title: "Optimizer",
    fields: [
      { key: "pop_size", label: "Population", step: 1, fmt: (v) => `${v}` },
      { key: "iters", label: "Iterations per epoch", step: 1, fmt: (v) => `${v}` },
    ],
  },
];

export default function MeshSimulator() {
  const mode = useConnection((s) => s.mode);
  const defaults = useResource<SimDefaults>(api.defaults, (d) => d.defaults);
  const sim = useSim();
  const reduced = useReducedMotion();
  const speed = useSettings((s) => s.speed);
  const model = useLiveModel();
  const [layers, toggle] = useLayers();
  const [draft, setDraft] = useState<SimParams | undefined>(sim.init?.params);

  useEffect(() => {
    if (!draft && (sim.init?.params || defaults.data)) setDraft(sim.init?.params ?? defaults.data!.params);
  }, [sim.init, defaults.data, draft]);

  const current = sim.init?.params;
  const dirty = useMemo(() => !!draft && !!current && JSON.stringify(draft) !== JSON.stringify(current), [draft, current]);
  const demo = mode === "demo";
  const limits = defaults.data?.limits ?? {};

  const apply = () => draft && void sim.reset(draft);
  const preset = (p: (typeof PRESETS)[number]) => defaults.data && setDraft({ ...defaults.data.params, seed: draft?.seed ?? 7, algorithm: draft?.algorithm ?? "HCDSO", ids_dataset: draft?.ids_dataset ?? defaults.data.params.ids_dataset, ...p.patch });

  return (
    <div className="sim-layout">
      <section className="panel sim-config" aria-label="Simulation configuration">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">Scenario</h2>
            <p className="panel__sub">Changes take effect when you rebuild the network.</p>
          </div>
        </div>
        <div className="panel__body stack">
          {demo && (
            <div className="notice notice--info">
              The recorded demo replays one fixed scenario. Start the server to change parameters.
            </div>
          )}
          {defaults.error && !demo && <ErrorNotice message={defaults.error} onRetry={defaults.reload} />}
          {!draft ? (
            <LoadingBlock label="Loading simulator defaults" rows={6} />
          ) : (
            <fieldset disabled={demo || sim.status === "connecting"} className="sim-fieldset">
              <div className="presets" role="group" aria-label="Scenario presets">
                {PRESETS.map((p) => (
                  <button key={p.id} className="preset" onClick={() => preset(p)} title={p.note}>
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid-2" style={{ gap: 10 }}>
                <label className="field-row">
                  <span className="label">Routing algorithm</span>
                  <select className="select" value={draft.algorithm} onChange={(ev) => setDraft({ ...draft, algorithm: ev.target.value as SimParams["algorithm"] })}>
                    {(defaults.data?.algorithms ?? ["HCDSO"]).map((a) => (
                      <option key={a} value={a}>
                        {a} · {ALGO_NAME[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-row">
                  <span className="label">IDS model trained on</span>
                  <select className="select" value={draft.ids_dataset} onChange={(ev) => setDraft({ ...draft, ids_dataset: ev.target.value as SimParams["ids_dataset"] })}>
                    {Object.entries(defaults.data?.ids_datasets ?? { [draft.ids_dataset]: DATASET_LABEL[draft.ids_dataset] }).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {GROUPS.map((g) => (
                <div key={g.title} className="cfg-group">
                  <h3 className="section-title">{g.title}</h3>
                  {g.fields.map((f) => {
                    const [min, max] = limits[f.key] ?? [0, 100];
                    return (
                      <label key={f.key} className="slider">
                        <span className="slider__top">
                          <span className="label">{f.label}</span>
                          <span className="mono slider__val">{f.fmt(draft[f.key])}</span>
                        </span>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={f.step}
                          value={draft[f.key]}
                          onChange={(ev) => setDraft({ ...draft, [f.key]: Number(ev.target.value) })}
                        />
                        {f.hint && <span className="slider__hint">{f.hint}</span>}
                      </label>
                    );
                  })}
                </div>
              ))}

              <label className="field-row" style={{ maxWidth: 160 }}>
                <span className="label">Random seed</span>
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  max={9999}
                  value={draft.seed}
                  onChange={(ev) => setDraft({ ...draft, seed: Math.max(0, Math.min(9999, Number(ev.target.value) || 0)) })}
                />
              </label>
            </fieldset>
          )}
        </div>
        <div className="sim-config__foot">
          {dirty ? <span className="chip chip--warn">Unapplied changes</span> : current && <span className="chip chip--ok"><Check size={12} />Network matches settings</span>}
          <div className="spacer" />
          <button className="btn" disabled={!dirty || demo} onClick={() => current && setDraft(current)}>
            Discard
          </button>
          <button className="btn btn--primary" disabled={!draft || demo || sim.status === "connecting"} onClick={apply}>
            Rebuild network
          </button>
        </div>
      </section>

      <section className="panel sim-preview" aria-label="Topology preview">
        <div className="sim-preview__map">
          {model ? (
            <TopologyField
              model={model}
              selection={sim.selection}
              onSelect={sim.select}
              focus={sim.focus}
              layers={layers}
              reduced={reduced || !sim.animate}
              nodeMoveMs={sim.phase === "deliver" ? deliverMs(speed) : 0}
              ariaLabel={`Preview of ${model.nodes.length} nodes`}
            >
              <Legend layers={layers} onToggle={toggle} compact />
            </TopologyField>
          ) : (
            <LoadingBlock label="Building network" />
          )}
        </div>
        <RunState />
        {sim.status === "error" && (
          <div style={{ padding: "0 14px 14px" }}>
            <ErrorNotice message={sim.error ?? "The simulation stopped."} onRetry={apply} />
          </div>
        )}
        {current && (
          <p className="sim-preview__foot secondary small">
            Running {current.algorithm} with the {DATASET_LABEL[current.ids_dataset]} IDS, seed <span className="mono">{current.seed}</span>.{" "}
            <Link to="/">Open in Command Center</Link> for the full inspector and event stream.
          </p>
        )}
      </section>
    </div>
  );
}

function RunState() {
  const sim = useSim();
  const e = sim.epochs[sim.cursor];
  const ready = !!sim.init && sim.status !== "connecting";
  const c = e?.cumulative;
  const reduced = useReducedMotion();
  return (
    <div className="runstate">
      <div className="runstate__controls">
        {sim.playing ? (
          <button className="btn btn--primary" onClick={sim.pause}>
            <Pause size={14} />
            Pause
          </button>
        ) : (
          <button className="btn btn--primary" onClick={sim.play} disabled={!ready || sim.status === "ended"}>
            <Play size={14} />
            Start
          </button>
        )}
        <button className="btn" onClick={() => { sim.pause(); void sim.advance(); }} disabled={!ready || sim.pending || sim.status === "ended"}>
          <StepForward size={14} />
          Step
        </button>
        <button className="btn" onClick={() => void sim.reset(sim.init?.params)} disabled={sim.status === "connecting"}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
      <dl className="runstate__stats">
        <div>
          <dt>Epoch</dt>
          <dd className="mono">{e ? e.epoch : 0}</dd>
        </div>
        <div>
          <dt>Simulated time</dt>
          <dd className="mono">{fmt.simTime(e?.time_ms ?? 0)}</dd>
        </div>
        <div>
          <dt>Server compute</dt>
          <dd className="mono">{sim.latencyMs ? `${sim.latencyMs.toFixed(0)} ms` : "—"}</dd>
        </div>
        <div>
          <dt>Delivery so far</dt>
          <dd className="mono">{c ? fmt.pct(c.pdr) : "—"}</dd>
        </div>
        <div>
          <dt>Attackers caught</dt>
          <dd className="mono">{c ? fmt.pct(c.detection_rate, 0) : "—"}</dd>
        </div>
      </dl>
      {sim.status === "connecting" && (
        <motion.div className="runstate__busy" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
          Building the network on the server…
        </motion.div>
      )}
    </div>
  );
}
