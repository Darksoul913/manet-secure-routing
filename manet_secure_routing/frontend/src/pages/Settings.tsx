import { RefreshCw } from "lucide-react";
import { Segmented } from "../components/ui/primitives";
import { DATASET_LABEL, fmt } from "../lib/format";
import { useConnection } from "../state/connection";
import { useSettings, type MotionPref } from "../state/settings";

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting">
      <span className="setting__text">
        <span className="setting__label">{label}</span>
        <span className="secondary small">{hint}</span>
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  const conn = useConnection();
  return (
    <div className="settings">
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Playback and motion</h2>
        </div>
        <div className="panel__body stack">
          <div className="setting">
            <span className="setting__text">
              <span className="setting__label">Motion</span>
              <span className="secondary small">Reduced motion replaces route tracing, packet particles and pulses with instant state changes.</span>
            </span>
            <Segmented<MotionPref>
              label="Motion"
              value={s.motion}
              onChange={(motion) => s.set({ motion })}
              options={[
                { value: "system", label: "Follow system" },
                { value: "full", label: "Full" },
                { value: "reduced", label: "Reduced" },
              ]}
            />
          </div>
          <div className="setting">
            <span className="setting__text">
              <span className="setting__label">Default playback speed</span>
              <span className="secondary small">One epoch is 100 ms of simulated time; at 1× it plays over about four seconds.</span>
            </span>
            <Segmented
              label="Playback speed"
              value={String(s.speed)}
              onChange={(v) => s.set({ speed: Number(v) })}
              options={["0.5", "1", "2", "4"].map((v) => ({ value: v, label: `${v}×` }))}
            />
          </div>
          <Toggle label="Packet particles" hint="Animate delivered packets along route links." checked={s.particles} onChange={(particles) => s.set({ particles })} />
          <Toggle
            label="Follow new detections"
            hint="When the IDS flags a node, select it and frame the map on the detections."
            checked={s.autoFocus}
            onChange={(autoFocus) => s.set({ autoFocus })}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Map</h2>
        </div>
        <div className="panel__body stack">
          <Toggle
            label="Always show node IDs"
            hint="Otherwise IDs appear on hover and for the selected node."
            checked={s.labels === "always"}
            onChange={(v) => s.set({ labels: v ? "always" : "hover" })}
          />
          <Toggle
            label="Ground truth overlay"
            hint="Outline the simulator's real attackers with a dashed box. The IDS never sees this; it is for judging detections."
            checked={s.showTruth}
            onChange={(showTruth) => s.set({ showTruth })}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Data source</h2>
          <div className="spacer" />
          <button className="btn btn--sm" onClick={() => void conn.check()}>
            <RefreshCw size={13} />
            Check again
          </button>
        </div>
        <div className="panel__body">
          <dl className="kv">
            <dt>Mode</dt>
            <dd>{{ checking: "Checking…", live: "Live server", demo: "Recorded demo", offline: "Offline" }[conn.mode]}</dd>
            <dt>Compute device</dt>
            <dd>{conn.health?.device ?? "—"}</dd>
            <dt>Simulation IDS</dt>
            <dd>{conn.health ? DATASET_LABEL[conn.health.ids_dataset] : "—"}</dd>
            <dt>Config fingerprint</dt>
            <dd>{conn.health?.config_sha ?? "—"}</dd>
            <dt>Trained checkpoints</dt>
            <dd>
              {conn.health
                ? Object.entries(conn.health.checkpoints)
                    .filter(([, v]) => v)
                    .map(([k]) => DATASET_LABEL[k])
                    .join(", ")
                : "—"}
            </dd>
            {conn.mode === "demo" && (
              <>
                <dt>Demo captured</dt>
                <dd>{fmt.date(conn.demo?.captured)}</dd>
              </>
            )}
          </dl>
          <p className="secondary small" style={{ marginTop: 12 }}>
            The interface talks to <code className="mono">/api</code> and <code className="mono">/ws/sim</code> on the same host. In development
            Vite proxies both to <code className="mono">127.0.0.1:8000</code>.
          </p>
        </div>
      </section>
    </div>
  );
}
