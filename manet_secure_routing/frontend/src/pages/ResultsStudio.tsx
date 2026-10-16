import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorNotice, LoadingBlock, Segmented } from "../components/ui/primitives";
import { api } from "../lib/api";
import { ALGO_COLOR, ALGORITHMS, MODEL_ORDER } from "../lib/colors";
import { DATASET_LABEL, fmt } from "../lib/format";
import type { Algorithm, IdsResults, RoutingResults, ScalabilityResults } from "../lib/types";
import { useConnection, useResource } from "../state/connection";

type Row = Record<string, string | number>;
interface TableDef {
  id: string;
  label: string;
  file?: string; // source CSV under results/tables
  rows: Row[];
  config: string;
}

const ROUTING_KEYS = ["throughput_kbps", "pdr", "energy_j", "delay_ms", "hop_count"] as const;
const ROUTING_LABEL: Record<(typeof ROUTING_KEYS)[number], string> = {
  throughput_kbps: "Throughput",
  pdr: "Delivery ratio",
  energy_j: "Energy",
  delay_ms: "Delay",
  hop_count: "Hop count",
};

export default function ResultsStudio() {
  const ids = useResource<IdsResults>(api.ids, (d) => d.ids);
  const routing = useResource<RoutingResults>(api.routing, (d) => d.routing);
  const scal = useResource<ScalabilityResults>(api.scalability, (d) => d.scalability);
  const files = useResource(api.files, (d) => d.files);
  const mode = useConnection((s) => s.mode);

  const tables = useMemo<TableDef[]>(() => {
    const out: TableDef[] = [];
    for (const [k, v] of Object.entries(ids.data ?? {})) {
      out.push({
        id: `ids_${k}`, label: `IDS · ${v!.label}`, file: `ids_${k}.csv`, config: "config/md_lstm.yaml, 70/15/15 split",
        rows: v!.models.map((m) => ({ ...m })),
      });
    }
    if (routing.data) {
      out.push({
        id: "routing_mean", label: "Routing · mean per time", file: "routing_mean.csv",
        config: `config/hcdso.yaml, seeds ${routing.data.seeds.join(", ")}, ${DATASET_LABEL[routing.data.ids_dataset]} IDS`,
        rows: routing.data.mean.map((m) => ({ ...m })),
      });
      out.push({
        id: "routing_improvement", label: "Routing · HCDSO improvement %", file: "routing_hcdso_improvement_pct.csv",
        config: "Mean over 100–1000 ms; positive = HCDSO better",
        rows: routing.data.improvement.map((m) => ({ ...m })),
      });
    }
    if (scal.data) {
      out.push({
        id: "scalability", label: "Scalability sweeps", file: "scalability_summary.csv", config: "config/experiment.yaml scalability block",
        rows: scal.data.rows.map((m) => ({ ...m })),
      });
    }
    return out;
  }, [ids.data, routing.data, scal.data]);

  const loading = ids.loading || routing.loading || scal.loading;
  const err = ids.error || routing.error || scal.error;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {err && <ErrorNotice message={err} onRetry={() => { ids.reload(); routing.reload(); scal.reload(); }} />}
      {loading ? <LoadingBlock label="Loading results" rows={8} /> : tables.length > 0 && <TableExplorer tables={tables} live={mode === "live"} />}
      <div className="grid-2">
        {routing.data && <RoutingVersus data={routing.data} />}
        {ids.data && <IdsVersus data={ids.data} />}
      </div>
      {mode === "live" && files.data && <Figures names={files.data.figures} />}
    </div>
  );
}

// ------------------------------------------------------------------ explorer

function TableExplorer({ tables, live }: { tables: TableDef[]; live: boolean }) {
  const [id, setId] = useState(tables[0].id);
  const t = tables.find((x) => x.id === id) ?? tables[0];
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [algos, setAlgos] = useState<Set<string>>(new Set(ALGORITHMS));
  const [sweep, setSweep] = useState<"all" | "population" | "chromosome">("all");

  const cols = Object.keys(t.rows[0] ?? {});
  const hasAlgo = cols.includes("algorithm") || cols.includes("vs");
  const algoCol = cols.includes("algorithm") ? "algorithm" : "vs";
  let rows = t.rows.filter((r) => !hasAlgo || algos.has(String(r[algoCol])));
  if (cols.includes("sweep") && sweep !== "all") rows = rows.filter((r) => r.sweep === sweep);
  if (sort) rows = [...rows].sort((a, b) => (a[sort.col] > b[sort.col] ? 1 : a[sort.col] < b[sort.col] ? -1 : 0) * sort.dir);

  const exportView = () => {
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.id}_view.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtCell = (c: string, v: string | number) => {
    if (typeof v !== "number") return v;
    if (["accuracy", "precision", "recall", "f1", "fpr", "fnr", "pdr", "detection_rate"].includes(c)) return fmt.pct(v, 2);
    if (t.id === "routing_improvement") return fmt.signedPct(v, 2);
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toFixed(Math.abs(v) >= 100 ? 1 : 4);
  };

  return (
    <section className="panel">
      <div className="panel__head" style={{ flexWrap: "wrap" }}>
        <FileSpreadsheet size={16} aria-hidden="true" />
        <label className="row">
          <span className="visually-hidden">Table</span>
          <select className="select" value={t.id} onChange={(e) => { setId(e.target.value); setSort(null); }}>
            {tables.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <span className="secondary small">{t.config}</span>
        <div className="spacer" />
        {cols.includes("sweep") && (
          <Segmented label="Sweep" value={sweep} onChange={setSweep} options={[{ value: "all", label: "Both sweeps" }, { value: "population", label: "Population" }, { value: "chromosome", label: "Chromosome" }]} />
        )}
        <button className="btn btn--sm" onClick={exportView}>
          <Download size={13} />
          This view as CSV
        </button>
        {live && t.file && (
          <a className="btn btn--sm" href={`/api/files/tables/${t.file}`} download>
            <Download size={13} />
            Original file
          </a>
        )}
      </div>
      {hasAlgo && (
        <div className="filters" role="group" aria-label="Filter algorithms">
          {ALGORITHMS.filter((a) => t.rows.some((r) => r[algoCol] === a)).map((a) => (
            <label key={a} className="filter-chip">
              <input
                type="checkbox"
                checked={algos.has(a)}
                onChange={() => setAlgos((s) => { const n = new Set(s); if (n.has(a)) n.delete(a); else n.add(a); return n; })}
              />
              <span className="sw" style={{ background: ALGO_COLOR[a as Algorithm] }} />
              {a}
            </label>
          ))}
        </div>
      )}
      <div className="table-scroll" style={{ maxHeight: 420 }}>
        <table className="table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className={typeof t.rows[0][c] === "number" ? "num" : ""} aria-sort={sort?.col === c ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button onClick={() => setSort((s) => (s?.col === c ? { col: c, dir: s.dir === 1 ? -1 : 1 } : { col: c, dir: 1 }))}>
                    {c.replace(/_/g, " ")}
                    {sort?.col === c ? sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : <ArrowUpDown size={11} className="muted" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className={typeof r[c] === "number" ? "num" : ""}>
                    {fmtCell(c, r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="secondary small" style={{ padding: "8px 14px" }}>
        {rows.length} of {t.rows.length} rows{t.file ? ` · source results/tables/${t.file}` : ""}
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ proposed vs baseline

function DeltaBar({ label, value, unit = "%", better, scale }: { label: string; value: number; unit?: string; better: boolean; scale: number }) {
  const mag = Math.min(1, Math.abs(value) / scale);
  const Icon = Math.abs(value) < 0.05 ? Minus : better ? ArrowUp : ArrowDown;
  return (
    <div className="delta">
      <span className="delta__label">{label}</span>
      <div className="delta__track" aria-hidden="true">
        <span className="delta__zero" />
        <span
          className={`delta__bar ${better ? "is-better" : "is-worse"}`}
          style={better ? { left: "50%", width: `${mag * 50}%` } : { right: "50%", width: `${mag * 50}%` }}
        />
      </div>
      <span className={`delta__value mono ${better ? "is-better" : "is-worse"}`}>
        <Icon size={12} aria-hidden="true" />
        {value > 0 ? "+" : value < 0 ? "−" : ""}
        {Math.abs(value).toFixed(2)}
        {unit}
      </span>
    </div>
  );
}

function RoutingVersus({ data }: { data: RoutingResults }) {
  const baselines = data.improvement.map((r) => r.vs);
  const [vs, setVs] = useState<Algorithm>(baselines[0]);
  const row = data.improvement.find((r) => r.vs === vs)!;
  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">HCDSO against a baseline</h2>
          <p className="panel__sub">Mean over 100–1000 ms. Bars to the right mean HCDSO did better.</p>
        </div>
        <div className="spacer" />
        <select className="select" value={vs} onChange={(e) => setVs(e.target.value as Algorithm)} aria-label="Baseline">
          {baselines.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="panel__body deltas">
        {ROUTING_KEYS.map((k) => (
          <DeltaBar key={k} label={ROUTING_LABEL[k]} value={row[k]} better={row[k] >= 0} scale={Math.max(1, ...ROUTING_KEYS.map((j) => Math.abs(row[j])))} />
        ))}
        <p className="secondary small">
          Bars are scaled to the largest difference shown. The paper reports 14–18% gains; this implementation measures
          differences within a few percent.
        </p>
      </div>
    </section>
  );
}

function IdsVersus({ data }: { data: IdsResults }) {
  const [vs, setVs] = useState("DNN");
  const keys = Object.keys(data) as (keyof IdsResults)[];
  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">MD-LSTM against a baseline</h2>
          <p className="panel__sub">Accuracy difference in percentage points, per dataset.</p>
        </div>
        <div className="spacer" />
        <select className="select" value={vs} onChange={(e) => setVs(e.target.value)} aria-label="Baseline model">
          {MODEL_ORDER.filter((m) => m !== "MD-LSTM").map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="panel__body deltas">
        {keys.map((k) => {
          const d = data[k]!;
          const a = d.models.find((m) => m.model === "MD-LSTM");
          const b = d.models.find((m) => m.model === vs);
          if (!a || !b) return null;
          const diff = (a.accuracy - b.accuracy) * 100;
          const scale = Math.max(0.1, ...keys.map((kk) => {
            const ms = data[kk]!.models;
            const x = ms.find((m) => m.model === "MD-LSTM");
            const y = ms.find((m) => m.model === vs);
            return x && y ? Math.abs(x.accuracy - y.accuracy) * 100 : 0;
          }));
          return <DeltaBar key={k} label={d.label} value={diff} unit=" pp" better={diff >= 0} scale={scale} />;
        })}
      </div>
    </section>
  );
}

function Figures({ names }: { names: string[] }) {
  const [open, setOpen] = useState<string>();
  if (!names.length) return null;
  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Figures from the experiment scripts</h2>
          <p className="panel__sub">Matplotlib output written to results/figures, for the report.</p>
        </div>
      </div>
      <div className="figures">
        {names.map((n) => (
          <figure key={n} className={`figure ${open === n ? "is-open" : ""}`}>
            <button onClick={() => setOpen(open === n ? undefined : n)} aria-expanded={open === n}>
              <img src={`/api/files/figures/${n}`} alt={n.replace(/_/g, " ").replace(".png", "")} loading="lazy" />
            </button>
            <figcaption className="row">
              <span className="mono small">{n}</span>
              <div className="spacer" />
              <a className="btn btn--sm btn--ghost" href={`/api/files/figures/${n}`} download aria-label={`Download ${n}`}>
                <Download size={13} />
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
