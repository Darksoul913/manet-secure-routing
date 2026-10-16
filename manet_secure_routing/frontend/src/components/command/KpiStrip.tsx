import { ShieldAlert } from "lucide-react";
import { fmt } from "../../lib/format";
import { useSim } from "../../state/sim";
import { Sparkline } from "../ui/primitives";

/** Cumulative measurements from the simulator, as of what is on screen. */
export function KpiStrip() {
  const init = useSim((s) => s.init);
  const epochs = useSim((s) => s.epochs);
  const cursor = useSim((s) => s.cursor);
  const phase = useSim((s) => s.phase);
  const e = epochs[cursor];
  // The current epoch's packets count once its delivery phase has started.
  const measuredUpTo = e && (phase === "deliver" || phase === "done") ? cursor : cursor - 1;
  const hist = epochs.slice(0, measuredUpTo + 1).map((x) => x.cumulative);
  const c = hist[hist.length - 1];
  const isolatedShown = e ? (phase === "detect" ? epochs[cursor - 1]?.isolate.blocked.length ?? 0 : e.isolate.blocked.length) : 0;
  const n = init?.positions.length ?? 0;
  const flagged = e?.detect.flagged.length ?? 0;

  const items = [
    { label: "Active nodes", value: init ? `${n - isolatedShown}` : "—", unit: init ? `of ${n}` : "", series: [] as number[] },
    { label: "Detected threats", value: e ? `${flagged}` : "—", unit: e ? `${isolatedShown} isolated` : "", series: [], alert: flagged > 0 },
    { label: "Packet delivery", value: c ? fmt.pct(c.pdr) : "—", unit: "", series: hist.map((h) => h.pdr) },
    { label: "Throughput", value: c ? fmt.kbps(c.throughput_kbps) : "—", unit: "", series: hist.map((h) => h.throughput_kbps) },
    { label: "End-to-end delay", value: c ? fmt.ms(c.delay_ms) : "—", unit: "", series: hist.map((h) => h.delay_ms) },
    { label: "Energy used", value: c ? fmt.joules(c.energy_j) : "—", unit: "", series: hist.map((h) => h.energy_j) },
  ];

  return (
    <dl className="kpis" aria-label="Network measurements">
      {items.map((it) => (
        <div className="kpi" key={it.label} title={!c && it.series ? "Measured once the first epoch delivers packets" : undefined}>
          <dt className="kpi__label">
            {it.alert && <ShieldAlert size={12} color="var(--crit)" aria-hidden="true" />}
            {it.label}
          </dt>
          <dd className="kpi__value">
            <span>{it.value}</span>
            {it.unit && <span className="kpi__unit">{it.unit}</span>}
          </dd>
          {it.series.length > 1 && (
            <div className="kpi__spark">
              <Sparkline values={it.series} width={56} height={16} />
            </div>
          )}
        </div>
      ))}
    </dl>
  );
}
