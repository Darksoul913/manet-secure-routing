import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { useSettings } from "../../state/settings";
import { useSim } from "../../state/sim";

const SPEEDS = [0.5, 1, 2, 4];

export function SimControls() {
  const sim = useSim();
  const speed = useSettings((s) => s.speed);
  const set = useSettings((s) => s.set);
  const ready = !!sim.init && sim.status !== "connecting";
  const ended = sim.status === "ended";

  return (
    <div className="simctl" role="group" aria-label="Simulation playback">
      {sim.playing ? (
        <button className="btn btn--primary" onClick={sim.pause}>
          <Pause size={14} />
          <span className="btn__label">Pause</span>
        </button>
      ) : (
        <button className="btn btn--primary" onClick={sim.play} disabled={!ready || ended} title={ended ? "The recorded demo has no more epochs" : undefined}>
          <Play size={14} />
          <span className="btn__label">Play</span>
        </button>
      )}
      <button
        className="btn btn--icon"
        onClick={() => {
          sim.pause();
          void sim.advance();
        }}
        disabled={!ready || sim.pending || ended}
        aria-label="Run one epoch"
        title="Run one epoch"
      >
        <StepForward size={15} />
      </button>
      <button
        className="btn btn--icon"
        onClick={() => void sim.reset(sim.init?.params)}
        disabled={sim.status === "connecting"}
        aria-label="Reset simulation"
        title="Reset to the same seed and settings"
      >
        <RotateCcw size={14} />
      </button>
      <label className="simctl__speed">
        <span className="visually-hidden">Playback speed</span>
        <select className="select" value={speed} onChange={(e) => set({ speed: Number(e.target.value) })}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function SimStatus() {
  const sim = useSim();
  const e = sim.epochs[sim.cursor];
  let label = "Not started";
  let tone = "neutral";
  if (sim.status === "connecting") label = "Preparing network…";
  else if (sim.status === "error") {
    label = "Simulation error";
    tone = "crit";
  } else if (sim.status === "ended") label = "Recorded demo finished";
  else if (sim.init) {
    if (sim.pending && sim.cursor === sim.epochs.length - 1 && sim.phase === "done") label = "Computing next epoch…";
    else if (sim.playing) {
      label = "Running";
      tone = "ok";
    } else label = e ? "Paused" : "Ready";
  }
  return (
    <div className="simstatus" aria-live="polite">
      <span className={`dot dot--${tone}`} aria-hidden="true" />
      <span>{label}</span>
      {e && (
        <span className="mono muted">
          epoch {e.epoch} · t = {(e.time_ms / 1000).toFixed(1)} s
        </span>
      )}
    </div>
  );
}
