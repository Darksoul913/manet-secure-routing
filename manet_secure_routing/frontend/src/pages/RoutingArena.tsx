import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID, SeriesLegend } from "../components/charts/charts";
import { emptyModel, type FieldModel } from "../components/field/model";
import { TopologyField } from "../components/field/TopologyField";
import { Empty, ErrorNotice, LoadingBlock, Segmented } from "../components/ui/primitives";
import { api } from "../lib/api";
import { ALGO_COLOR, ALGO_NAME, ALGORITHMS, PHASE_COLOR } from "../lib/colors";
import { DATASET_LABEL, fmt } from "../lib/format";
import type { Algorithm, ArenaResult, RoutingResults, ScalabilityResults } from "../lib/types";
import { useConnection, useResource } from "../state/connection";
import { useReducedMotion } from "../state/settings";

const METRICS = [
  { key: "throughput_kbps", label: "Throughput", short: "Thr. kbps", unit: "kbps", better: "max", format: (v: number) => fmt.num(v, 0) },
  { key: "pdr", label: "Packet delivery ratio", short: "PDR", unit: "", better: "max", format: (v: number) => fmt.pct(v, 1) },
  { key: "energy_j", label: "Energy consumed", short: "Energy J", unit: "J", better: "min", format: (v: number) => fmt.num(v, 2) },
  { key: "delay_ms", label: "End-to-end delay", short: "Delay ms", unit: "ms", better: "min", format: (v: number) => fmt.num(v, 1) },
  { key: "hop_count", label: "Hop count", short: "Hops", unit: "", better: "min", format: (v: number) => fmt.num(v, 2) },
] as const;

export default function RoutingArena() {
  const [enabled, setEnabled] = useState<Record<Algorithm, boolean>>({ HCDSO: true, DSO: true, COA: true, POA: true, BCO: true });
  const legend = ALGORITHMS.map((a) => ({
    name: a,
    color: ALGO_COLOR[a],
    dim: !enabled[a],
    onClick: () => setEnabled((e) => ({ ...e, [a]: !e[a] })),
  }));
  const shown = ALGORITHMS.filter((a) => enabled[a]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="arena-legend">
        <span className="secondary small">Algorithms shown</span>
        <SeriesLegend items={legend} />
      </div>
      <Recorded shown={shown} />
      <ConvergenceLab shown={shown} />
      <Scalability shown={shown} />
    </div>
  );
}

// ------------------------------------------------------------------ recorded routing experiment

function Recorded({ shown }: { shown: Algorithm[] }) {
  const res = useResource<RoutingResults>(api.routing, (d) => d.routing);
  if (res.loading) return <LoadingBlock label="Loading routing results" rows={6} />;
  if (res.error) return <ErrorNotice message={res.error} onRetry={res.reload} />;
  const r = res.data!;
  const times = [...new Set(r.mean.map((m) => m.time_ms))].sort((a, b) => a - b);
  const rows = times.map((t) => {
    const row: Record<string, number> = { time_ms: t };
    for (const m of r.mean.filter((x) => x.time_ms === t)) for (const k of METRICS) row[`${m.algorithm}_${k.key}`] = m[k.key];
    return row;
  });
  const overall = (a: Algorithm, key: (typeof METRICS)[number]["key"]) => {
    const v = r.mean.filter((m) => m.algorithm === a).map((m) => m[key]);
    return v.reduce((s, x) => s + x, 0) / v.length;
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Recorded comparison, 100 to 1000 ms</h2>
          <p className="panel__sub">
            Closed-loop simulation with the {DATASET_LABEL[r.ids_dataset]} MD-LSTM as IDS, mean of seeds {r.seeds.join(", ")}. Recorded{" "}
            {fmt.date(r.recorded)}.
          </p>
        </div>
      </div>
      <div className="panel__body">
        <div className="multiples">
          {METRICS.map((m) => (
            <figure key={m.key} className="multiple">
              <figcaption>
                {m.label}
                {m.unit && <span className="muted"> ({m.unit})</span>}
                <span className="muted small"> · {m.better === "max" ? "higher" : "lower"} is better</span>
              </figcaption>
              <div style={{ height: 170 }}>
                <ResponsiveContainer>
                  <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="time_ms" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tickFormatter={(v) => `${v}`} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} domain={["auto", "auto"]} tickFormatter={m.format} />
                    <Tooltip
                      cursor={{ stroke: "var(--border-strong)" }}
                      content={<ChartTooltip labelFormat={(l) => `${l} ms simulated`} valueFormat={(v) => m.format(v)} />}
                    />
                    {shown.map((a) => (
                      <Line
                        key={a}
                        dataKey={`${a}_${m.key}`}
                        name={a}
                        stroke={ALGO_COLOR[a]}
                        strokeWidth={a === "HCDSO" ? 2.4 : 1.6}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>
          ))}
          <figure className="multiple multiple--table">
            <figcaption>Mean over all simulation times</figcaption>
            <table className="table">
              <thead>
                <tr>
                  <th>Algorithm</th>
                  {METRICS.map((m) => (
                    <th key={m.key} className="num" title={m.label}>
                      {m.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a}>
                    <td>
                      <span className="sw" style={{ background: ALGO_COLOR[a] }} />
                      {a}
                    </td>
                    {METRICS.map((m) => {
                      const vals = shown.map((x) => overall(x, m.key));
                      const v = overall(a, m.key);
                      const isBest = v === (m.better === "max" ? Math.max(...vals) : Math.min(...vals));
                      return (
                        <td key={m.key} className={`num ${isBest ? "is-best" : ""}`}>
                          {m.format(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="secondary small">
              <span className="best-mark">▲</span> best among shown algorithms. Differences are small: all five optimisers converge to
              similar trees on this decoder.
            </p>
          </figure>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ on-demand convergence run

function arenaModel(a: ArenaResult, algo: Algorithm): FieldModel {
  const m = emptyModel(a.area, 250);
  const dests = new Set(a.destinations);
  const blocked = new Set(a.blocked);
  const route = a.runs[algo].edges;
  const inRoute = new Set(route.flat());
  m.nodes = a.positions.map((pos, id) => ({
    id, pos, inRoute: inRoute.has(id),
    role: id === a.source ? "source" : dests.has(id) ? "destination" : "relay",
    state: blocked.has(id) ? "isolated" : "healthy",
  }));
  m.links = a.edges;
  m.route = route;
  m.routeKey = `${algo}-${a.seed}-${a.pop_size}-${a.iters}`;
  return m;
}

function ConvergenceLab({ shown }: { shown: Algorithm[] }) {
  const mode = useConnection((s) => s.mode);
  const demo = useConnection((s) => s.demo);
  const reduced = useReducedMotion();
  const [params, setParams] = useState({ seed: 1, pop: 30, iters: 40 });
  const [state, setState] = useState<{ data?: ArenaResult; error?: string; loading: boolean }>({ loading: false });

  const run = () => {
    if (mode === "demo") return;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    api
      .arena(params.seed, params.pop, params.iters)
      .then((data) => setState({ data, loading: false }))
      .catch((e: Error) => setState({ loading: false, error: e.message }));
  };
  useEffect(() => {
    if (mode === "demo" && demo) setState({ data: demo.arena, loading: false });
    else if (mode === "live") run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const a = state.data;
  const curves = useMemo(
    () => (a ? a.runs.HCDSO.curve.map((_, i) => ({ it: i + 1, ...Object.fromEntries(ALGORITHMS.map((x) => [x, a.runs[x].curve[i]])) })) : []),
    [a],
  );

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Convergence on one network</h2>
          <p className="panel__sub">
            Every optimiser runs live on the same snapshot, with attackers removed using ground truth so only the optimiser differs.
          </p>
        </div>
        <div className="spacer" />
        <div className="row arena-run">
          <label className="row small">
            Seed
            <input className="input mono" style={{ width: 64 }} type="number" min={0} value={params.seed} disabled={mode === "demo"} onChange={(e) => setParams({ ...params, seed: Number(e.target.value) })} />
          </label>
          <label className="row small">
            Population
            <input className="input mono" style={{ width: 60 }} type="number" min={1} max={100} value={params.pop} disabled={mode === "demo"} onChange={(e) => setParams({ ...params, pop: Number(e.target.value) })} />
          </label>
          <label className="row small">
            Iterations
            <input className="input mono" style={{ width: 60 }} type="number" min={5} max={100} value={params.iters} disabled={mode === "demo"} onChange={(e) => setParams({ ...params, iters: Number(e.target.value) })} />
          </label>
          <button className="btn btn--primary" onClick={run} disabled={mode !== "live" || state.loading}>
            <Play size={14} />
            {state.loading ? "Running…" : "Run all five"}
          </button>
        </div>
      </div>
      <div className="panel__body stack">
        {mode === "demo" && <div className="notice notice--info">Showing the run captured with the demo (seed {a?.seed}). Start the server to run new ones.</div>}
        {state.error && <ErrorNotice message={state.error} onRetry={run} />}
        {!a ? (
          state.loading ? <LoadingBlock label="Running optimisers" rows={5} /> : <Empty title="No run yet">Choose a seed and run all five optimisers.</Empty>
        ) : (
          <>
            <div className="conv-grid" style={{ opacity: state.loading ? 0.5 : 1 }}>
              <figure className="multiple">
                <figcaption>Best fitness per iteration <span className="muted small">· lower is better</span></figcaption>
                <div style={{ height: 230 }}>
                  <ResponsiveContainer>
                    <LineChart data={curves} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="it" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={50} domain={["auto", "auto"]} tickFormatter={(v) => v.toFixed(3)} />
                      <Tooltip content={<ChartTooltip labelFormat={(l) => `Iteration ${l}`} valueFormat={(v) => v.toFixed(4)} />} />
                      {shown.map((x) => (
                        <Line key={x} dataKey={x} name={x} stroke={ALGO_COLOR[x]} strokeWidth={x === "HCDSO" ? 2.4 : 1.6} dot={false} type="stepAfter" isAnimationActive={!reduced} animationDuration={600} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="phase-row">
                  <span className="small secondary">HCDSO step per iteration</span>
                  <div className="phase-strip" style={{ flex: 1 }}>
                    {a.runs.HCDSO.phases.map((p, i) => (
                      <span key={i} className="phase-strip__cell" style={{ background: PHASE_COLOR[p] }} title={`Iteration ${i + 1}: ${p}`} />
                    ))}
                  </div>
                  <span className="small">
                    <span className="sw" style={{ background: PHASE_COLOR.COA }} />
                    COA {a.runs.HCDSO.phases.filter((p) => p === "COA").length}
                    <span className="sw" style={{ background: PHASE_COLOR.DSO, marginLeft: 10 }} />
                    DSO {a.runs.HCDSO.phases.filter((p) => p === "DSO").length}
                  </span>
                </div>
              </figure>
              <figure className="multiple multiple--table">
                <figcaption>Final route objectives</figcaption>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Algorithm</th>
                      <th className="num">Fitness</th>
                      <th className="num">Reliability</th>
                      <th className="num">Hops</th>
                      <th className="num">Energy/pkt</th>
                      <th className="num">Runtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((x) => {
                      const run = a.runs[x];
                      const isBest = run.best === Math.min(...shown.map((y) => a.runs[y].best));
                      return (
                        <tr key={x}>
                          <td>
                            <span className="sw" style={{ background: ALGO_COLOR[x] }} />
                            {x}
                          </td>
                          <td className={`num ${isBest ? "is-best" : ""}`}>{run.best.toFixed(4)}</td>
                          <td className="num">{fmt.pct(run.objectives.reliability)}</td>
                          <td className="num">{run.objectives.hops.toFixed(2)}</td>
                          <td className="num">{(run.objectives.energy * 1000).toFixed(2)} mJ</td>
                          <td className="num">{fmt.duration(run.runtime_s)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </figure>
            </div>
            <div className="route-maps">
              {shown.map((x) => (
                <figure key={x} className="route-map">
                  <figcaption>
                    <span className="sw" style={{ background: ALGO_COLOR[x] }} />
                    <strong>{x}</strong>
                    <span className="muted small" title={ALGO_NAME[x]}>{ALGO_NAME[x]}</span>
                  </figcaption>
                  <div className="route-map__field">
                    <TopologyField
                      model={arenaModel(a, x)}
                      layers={{ links: true, candidates: false, packets: false, labels: false, truth: false }}
                      reduced={reduced}
                      interactive={false}
                      ariaLabel={`${x} multicast tree`}
                    />
                  </div>
                  <div className="route-map__stats mono small">
                    {a.runs[x].edges.length} links · {a.runs[x].objectives.hops.toFixed(2)} hops · {fmt.pct(a.runs[x].objectives.reliability)}
                  </div>
                </figure>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ scalability

function Scalability({ shown }: { shown: Algorithm[] }) {
  const res = useResource<ScalabilityResults>(api.scalability, (d) => d.scalability);
  const [sweep, setSweep] = useState<"population" | "chromosome">("population");
  const [metric, setMetric] = useState<"fitness_mean" | "fitness_std" | "runtime_s">("fitness_mean");
  if (res.loading) return <LoadingBlock label="Loading scalability results" rows={4} />;
  if (res.error) return <ErrorNotice message={res.error} onRetry={res.reload} />;
  const rows = res.data!.rows.filter((r) => r.sweep === sweep);
  const xs = [...new Set(rows.map((r) => r.value))].sort((a, b) => a - b);
  const data = xs.map((v) => ({ v, ...Object.fromEntries(rows.filter((r) => r.value === v).map((r) => [r.algorithm, r[metric]])) }));
  const labels = { fitness_mean: "Best fitness (lower is better)", fitness_std: "Spread across seeds (std)", runtime_s: "Runtime per optimisation (s)" };
  const fmtV = (v: number) => (metric === "runtime_s" ? `${v.toFixed(2)} s` : v.toFixed(4));
  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Scalability</h2>
          <p className="panel__sub">
            {sweep === "population" ? "Population 10 to 100 with 50 nodes" : "10 to 100 nodes (chromosome length) at constant density, population 30"}. Recorded{" "}
            {fmt.date(res.data!.recorded)}.
          </p>
        </div>
        <div className="spacer" />
        <Segmented label="Sweep" value={sweep} onChange={setSweep} options={[{ value: "population", label: "Population" }, { value: "chromosome", label: "Chromosome" }]} />
        <Segmented
          label="Measure"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "fitness_mean", label: "Fitness" },
            { value: "fitness_std", label: "Spread" },
            { value: "runtime_s", label: "Runtime" },
          ]}
        />
      </div>
      <div className="panel__body">
        <figure className="multiple" style={{ margin: 0 }}>
          <figcaption>{labels[metric]}</figcaption>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="v" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} tickFormatter={fmtV} />
                <Tooltip content={<ChartTooltip labelFormat={(l) => `${sweep === "population" ? "Population" : "Nodes"} ${l}`} valueFormat={fmtV} />} />
                {shown.map((x) => (
                  <Line key={x} dataKey={x} name={x} stroke={ALGO_COLOR[x]} strokeWidth={x === "HCDSO" ? 2.4 : 1.6} dot={{ r: 3, strokeWidth: 0, fill: ALGO_COLOR[x] }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </div>
    </section>
  );
}
