import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, ConfusionMatrix, DotPlot, GRID, SeriesLegend } from "../components/charts/charts";
import { Empty, ErrorNotice, LoadingBlock, Segmented } from "../components/ui/primitives";
import { api } from "../lib/api";
import { MODEL_COLOR, MODEL_ORDER } from "../lib/colors";
import { fmt } from "../lib/format";
import type { DatasetKey, IdsResults } from "../lib/types";
import { useResource } from "../state/connection";
import { useSim } from "../state/sim";

const METRICS = [
  ["accuracy", "Accuracy"],
  ["precision", "Precision"],
  ["recall", "Recall"],
  ["f1", "F1 score"],
] as const;

export default function ThreatIntel() {
  const ids = useResource<IdsResults>(api.ids, (d) => d.ids);
  const [ds, setDs] = useState<DatasetKey>("cicids2017");
  const [cmModel, setCmModel] = useState("MD-LSTM");
  const [view, setView] = useState<"chart" | "table">("chart");

  if (ids.loading) return <LoadingBlock label="Loading IDS results" rows={8} />;
  if (ids.error) return <ErrorNotice message={ids.error} onRetry={ids.reload} />;
  const data = ids.data ?? {};
  const keys = (["cicids2017", "nsl_kdd", "kdd99"] as DatasetKey[]).filter((k) => data[k]);
  if (!keys.length)
    return (
      <Empty title="No IDS results recorded">
        Run one of the dataset experiments from the Experiments page to train MD-LSTM and its baselines.
      </Empty>
    );
  const active = data[ds] ? ds : keys[0];
  const r = data[active]!;
  const models = MODEL_ORDER.filter((m) => r.models.some((x) => x.model === m));
  const byModel = Object.fromEntries(r.models.map((m) => [m.model, m]));
  const best = (k: (typeof METRICS)[number][0]) => models.reduce((a, b) => (byModel[b][k] > byModel[a][k] ? b : a));

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="ti-head">
        <Segmented
          label="Dataset"
          value={active}
          onChange={setDs}
          options={keys.map((k) => ({ value: k, label: data[k]!.label }))}
        />
        <dl className="runid">
          <div>
            <dt>Recorded</dt>
            <dd>{fmt.date(r.recorded)}</dd>
          </div>
          {r.test && (
            <>
              <div>
                <dt>Test flows</dt>
                <dd className="mono">{r.test.rows.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Attack share</dt>
                <dd className="mono">{fmt.pct(r.test.attacks / r.test.rows)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Split</dt>
            <dd>70 / 15 / 15 stratified, binary labels</dd>
          </div>
        </dl>
      </div>

      <div className="ti-grid">
        <section className="panel" aria-labelledby="cmp-title">
          <div className="panel__head">
            <div>
              <h2 className="panel__title" id="cmp-title">
                Model comparison
              </h2>
              <p className="panel__sub">Held-out test split of {r.label}; the axis is zoomed to the range of the scores.</p>
            </div>
            <div className="spacer" />
            <Segmented
              label="Display"
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
            />
          </div>
          <div className="panel__body">
            {view === "chart" ? (
              <>
                <SeriesLegend items={models.map((m) => ({ name: m, color: MODEL_COLOR[m] }))} />
                <DotPlot
                  rows={METRICS.map(([k, label]) => ({ label, values: Object.fromEntries(models.map((m) => [m, byModel[m][k]])) }))}
                  series={models}
                  colors={MODEL_COLOR}
                  format={(v) => fmt.pct(v, 1)}
                />
              </>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      {METRICS.map(([k, l]) => (
                        <th key={k} className="num">
                          {l}
                        </th>
                      ))}
                      <th className="num">FPR</th>
                      <th className="num">FNR</th>
                      <th className="num">Train time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m}>
                        <td>
                          <span className="sw" style={{ background: MODEL_COLOR[m] }} />
                          {m}
                          {m === "MD-LSTM" && <span className="muted small"> proposed</span>}
                        </td>
                        {METRICS.map(([k]) => (
                          <td key={k} className={`num ${best(k) === m ? "is-best" : ""}`}>
                            {fmt.pct(byModel[m][k], 2)}
                          </td>
                        ))}
                        <td className="num">{fmt.pct(byModel[m].fpr, 2)}</td>
                        <td className="num">{fmt.pct(byModel[m].fnr, 2)}</td>
                        <td className="num">{fmt.duration(byModel[m].train_s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="secondary small" style={{ marginTop: 8 }}>
                  <span className="best-mark">▲</span> marks the best model per metric.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="err-title">
          <div className="panel__head">
            <div>
              <h2 className="panel__title" id="err-title">
                False alarms and misses
              </h2>
              <p className="panel__sub">Lower is better. False alarms isolate honest relays; misses leave attackers routing.</p>
            </div>
          </div>
          <div className="panel__body">
            <SeriesLegend items={models.map((m) => ({ name: m, color: MODEL_COLOR[m] }))} />
            <div style={{ height: 230 }}>
              <ResponsiveContainer>
                <BarChart
                  data={[
                    { metric: "False-positive rate", ...Object.fromEntries(models.map((m) => [m, byModel[m].fpr])) },
                    { metric: "False-negative rate", ...Object.fromEntries(models.map((m) => [m, byModel[m].fnr])) },
                  ]}
                  barGap={2}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="metric" tick={AXIS} axisLine={{ stroke: "var(--border-strong)" }} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmt.pct(v, 1)} width={48} />
                  <Tooltip cursor={{ fill: "rgba(23,38,51,0.04)" }} content={<ChartTooltip valueFormat={(v) => fmt.pct(v, 2)} />} />
                  {models.map((m) => (
                    <Bar key={m} dataKey={m} name={m} fill={MODEL_COLOR[m]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="cm-title">
          <div className="panel__head">
            <div>
              <h2 className="panel__title" id="cm-title">
                Confusion matrix
              </h2>
              <p className="panel__sub">{r.label} test split</p>
            </div>
            <div className="spacer" />
            <select className="select" value={cmModel} onChange={(e) => setCmModel(e.target.value)} aria-label="Model">
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="panel__body">
            {r.confusion?.[cmModel] ? (
              <ConfusionMatrix c={r.confusion[cmModel]} model={cmModel} />
            ) : (
              <p className="secondary">No held-out split saved for this dataset, so counts cannot be recovered.</p>
            )}
          </div>
        </section>

        <LiveDetections />
      </div>
    </div>
  );
}

/** Node-level detection inside the running simulation, scored against the simulator's ground truth. */
function LiveDetections() {
  const init = useSim((s) => s.init);
  const epochs = useSim((s) => s.epochs);
  const cursor = useSim((s) => s.cursor);
  const shown = epochs.slice(0, cursor + 1);

  const rows = useMemo(() => {
    if (!init) return [];
    const bad = new Set(init.truth.malicious);
    return shown.map((e) => {
      const flagged = new Set(e.detect.flagged);
      const tp = [...flagged].filter((n) => bad.has(n)).length;
      return {
        epoch: e.epoch,
        flagged: flagged.size,
        tp,
        fp: flagged.size - tp,
        fn: bad.size - tp,
        isolated: e.isolate.blocked.length,
        suspicious: e.detect.suspicious.length,
      };
    });
  }, [init, shown]);

  const byType = useMemo(() => {
    if (!init || !shown.length) return [];
    const last = new Set(shown[shown.length - 1].detect.flagged);
    const types: Record<string, { total: number; caught: number }> = {};
    for (const [id, kind] of Object.entries(init.truth.attackers)) {
      types[kind] ??= { total: 0, caught: 0 };
      types[kind].total++;
      if (last.has(Number(id))) types[kind].caught++;
    }
    return Object.entries(types);
  }, [init, shown]);

  return (
    <section className="panel" aria-labelledby="live-title">
      <div className="panel__head">
        <div>
          <h2 className="panel__title" id="live-title">
            Detection in the running simulation
          </h2>
          <p className="panel__sub">
            {init ? `MD-LSTM trained on ${init.ids_dataset === "nsl_kdd" ? "NSL-KDD" : init.ids_dataset === "kdd99" ? "KDD99" : "CICIDS2017"}, scored against the simulator's real attackers` : "No simulation running"}
          </p>
        </div>
      </div>
      <div className="panel__body">
        {!rows.length ? (
          <p className="secondary">Run epochs in the Command Center or Mesh Simulator to build a detection history.</p>
        ) : (
          <>
            <div className="attack-types">
              {byType.map(([kind, v]) => (
                <div key={kind} className="attack-type">
                  <span className="attack-type__name">{kind === "blackhole" ? "Blackhole" : "Grayhole"} attackers</span>
                  <span className="mono">
                    {v.caught}/{v.total} flagged now
                  </span>
                  <span className="secondary small">{kind === "blackhole" ? "drop every packet they relay" : "drop half of the packets they relay"}</span>
                </div>
              ))}
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Epoch</th>
                    <th className="num">Flagged</th>
                    <th className="num">Correct</th>
                    <th className="num">False alarms</th>
                    <th className="num">Missed</th>
                    <th className="num">Suspicious</th>
                    <th className="num">Isolated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .reverse()
                    .map((r) => (
                      <tr key={r.epoch}>
                        <td className="mono">{r.epoch}</td>
                        <td className="num">{r.flagged}</td>
                        <td className="num">{r.tp}</td>
                        <td className="num">{r.fp}</td>
                        <td className="num">{r.fn}</td>
                        <td className="num">{r.suspicious}</td>
                        <td className="num">{r.isolated}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
