import { CircleCheck, CircleX, Loader2, Play, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Empty, ErrorNotice, LoadingBlock, Segmented } from "../components/ui/primitives";
import { api } from "../lib/api";
import { fmt } from "../lib/format";
import type { ConfigBundle, RunRecord, ScriptInfo } from "../lib/types";
import { useConnection, useResource } from "../state/connection";

const ORDER = ["test_components", "exp_dataset1", "exp_dataset2", "exp_dataset3", "routing_exp", "scalability_exp"];
const DESCRIPTIONS: Record<string, string> = {
  test_components: "Shape, decoding, validation and optimiser checks. Takes seconds.",
  exp_dataset1: "Cleans and samples 300k flows, trains MD-LSTM, DNN, LSTM and a linear SVM.",
  exp_dataset2: "Merges Train+ and Test+, trains all four models. Its checkpoint drives the simulation's IDS.",
  exp_dataset3: "The 10% KDD Cup 1999 subset, de-duplicated, all four models.",
  routing_exp: "Five optimisers in the closed loop for 1000 ms on three seeds. Needs the NSL-KDD checkpoint.",
  scalability_exp: "Population and chromosome sweeps from 10 to 100 for all five optimisers.",
};

export default function Experiments() {
  const mode = useConnection((s) => s.mode);
  const [data, setData] = useState<{ scripts: Record<string, ScriptInfo>; runs: RunRecord[] }>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const live = mode === "live";

  const refresh = useCallback(() => {
    if (!live) return;
    api
      .experiments()
      .then((d) => {
        setData(d);
        setError(undefined);
      })
      .catch((e: Error) => setError(e.message));
  }, [live]);

  useEffect(refresh, [refresh]);
  const running = data?.runs.find((r) => r.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [running, refresh]);
  useEffect(() => {
    if (running) setSelected(running.id);
    else if (!selected && data?.runs[0]) setSelected(data.runs[0].id);
  }, [running, data, selected]);

  const start = async (name: string) => {
    try {
      const run = await api.runExperiment(name);
      setSelected(run.id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (mode === "demo" || mode === "offline")
    return (
      <Empty title="Experiments need the server">
        Runs execute the project's Python scripts on this machine, so they are unavailable in the recorded demo. Start the server with{" "}
        <code className="mono">PYTHONPATH=. uvicorn manet_secure_routing.server.app:app --port 8000</code> and reload.
      </Empty>
    );
  if (!data && !error) return <LoadingBlock label="Loading experiments" rows={6} />;

  return (
    <div className="exp-layout">
      <div className="stack">
        {error && <ErrorNotice message={error} onRetry={refresh} />}
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Scripts</h2>
              <p className="panel__sub">Each run executes the script unchanged and overwrites its result files. One run at a time.</p>
            </div>
          </div>
          <ul className="scripts">
            {data &&
              ORDER.filter((k) => data.scripts[k]).map((k) => {
                const s = data.scripts[k];
                const last = data.runs.find((r) => r.script === k);
                return (
                  <li key={k} className="script">
                    <div className="script__main">
                      <div className="script__title">
                        {s.title}
                        <code className="mono muted small">{k}.py</code>
                      </div>
                      <p className="secondary small">{DESCRIPTIONS[k]}</p>
                      <div className="row small muted" style={{ flexWrap: "wrap" }}>
                        <span>About {s.minutes < 1 ? "a few seconds" : `${s.minutes} min`}</span>
                        {s.outputs.length > 0 && <span>· writes {s.outputs.join(", ")}</span>}
                        {last && (
                          <span>
                            · last run {fmt.date(last.started)}, {last.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <button className="btn" onClick={() => void start(k)} disabled={!!running}>
                      {running?.script === k ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                      {running?.script === k ? "Running" : "Run"}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Run history</h2>
          </div>
          {data && data.runs.length === 0 ? (
            <p className="secondary" style={{ padding: 14 }}>
              No runs started from Mesh Sentinel yet. Results already in the tables came from running the scripts directly.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Script</th>
                    <th>Started</th>
                    <th className="num">Duration</th>
                    <th>Status</th>
                    <th>Config</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.runs.map((r) => (
                    <tr key={r.id} className={selected === r.id ? "is-selected" : ""} onClick={() => setSelected(r.id)} style={{ cursor: "pointer" }}>
                      <td className="mono">{r.script}</td>
                      <td>{fmt.date(r.started)}</td>
                      <td className="num">{fmt.duration(r.duration_s)}</td>
                      <td>
                        <RunStatus r={r} />
                      </td>
                      <td className="mono muted" title={`Python ${r.python} on ${r.device}`}>
                        {r.config_sha}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="stack">
        <LogPanel run={data?.runs.find((r) => r.id === selected)} />
        <ConfigPanel />
      </div>
    </div>
  );
}

function RunStatus({ r }: { r: RunRecord }) {
  if (r.status === "running")
    return (
      <span className="chip chip--info">
        <Loader2 size={12} className="spin" />
        Running
      </span>
    );
  if (r.status === "succeeded")
    return (
      <span className="chip chip--ok">
        <CircleCheck size={12} />
        Succeeded
      </span>
    );
  return (
    <span className="chip chip--crit">
      <CircleX size={12} />
      Failed{r.returncode !== undefined && r.returncode !== -1 ? ` (exit ${r.returncode})` : ""}
    </span>
  );
}

function LogPanel({ run }: { run?: RunRecord }) {
  const [lines, setLines] = useState<string[]>([]);
  const [err, setErr] = useState<string>();
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!run) return;
    let stop = false;
    const load = () =>
      api
        .runLog(run.id)
        .then((d) => !stop && setLines(d.lines))
        .catch((e: Error) => !stop && setErr(e.message));
    void load();
    if (run.status !== "running") return () => void (stop = true);
    const t = setInterval(load, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines]);

  return (
    <section className="panel">
      <div className="panel__head">
        <TerminalSquare size={16} aria-hidden="true" />
        <div>
          <h2 className="panel__title">Output</h2>
          <p className="panel__sub">{run ? `${run.script}.py · started ${fmt.date(run.started)}` : "Select a run to see its log"}</p>
        </div>
        <div className="spacer" />
        {run && <RunStatus r={run} />}
      </div>
      {err && <ErrorNotice message={err} />}
      <pre className="log" ref={ref} aria-live="polite">
        {run ? (lines.length ? lines.join("\n") : "Waiting for output…") : "—"}
      </pre>
      {run && (
        <dl className="kv" style={{ padding: "10px 14px" }}>
          <dt>Config fingerprint</dt>
          <dd>{run.config_sha}</dd>
          <dt>Python</dt>
          <dd>{run.python}</dd>
          <dt>Device</dt>
          <dd>{run.device}</dd>
          <dt>Log file</dt>
          <dd>results/logs/{run.log}</dd>
        </dl>
      )}
    </section>
  );
}

function ConfigPanel() {
  const cfg = useResource<ConfigBundle>(api.config, (d) => d.config);
  const [file, setFile] = useState<"md_lstm" | "hcdso" | "experiment">("hcdso");
  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Configuration</h2>
          <p className="panel__sub">
            Read from <code className="mono">config/{file}.yaml</code>. Edit the file to change what the scripts run.
          </p>
        </div>
        <div className="spacer" />
        <Segmented
          label="Config file"
          value={file}
          onChange={setFile}
          options={[
            { value: "md_lstm", label: "IDS" },
            { value: "hcdso", label: "Network" },
            { value: "experiment", label: "Sweeps" },
          ]}
        />
      </div>
      {cfg.error ? <ErrorNotice message={cfg.error} onRetry={cfg.reload} /> : <pre className="log log--config">{cfg.data?.[file].text ?? "Loading…"}</pre>}
    </section>
  );
}
