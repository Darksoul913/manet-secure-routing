import { useEffect, useState } from "react";
import { EventTimeline } from "../components/command/EventTimeline";
import { Inspector } from "../components/command/Inspector";
import { KpiStrip } from "../components/command/KpiStrip";
import { PipelineTrack } from "../components/command/PipelineTrack";
import { Legend } from "../components/field/Legend";
import { TopologyField, type Layers } from "../components/field/TopologyField";
import { deliverMs, useLiveModel } from "../components/field/useLiveModel";
import { Empty, ErrorNotice, Skeleton } from "../components/ui/primitives";
import { useConnection } from "../state/connection";
import { useReducedMotion, useSettings } from "../state/settings";
import { useSim } from "../state/sim";

export function useLayers(): [Layers, (k: keyof Layers) => void] {
  const settings = useSettings();
  const [local, setLocal] = useState({ links: true, candidates: true });
  const layers: Layers = {
    ...local,
    packets: settings.particles,
    labels: settings.labels === "always",
    truth: settings.showTruth,
  };
  const toggle = (k: keyof Layers) => {
    if (k === "packets") settings.set({ particles: !settings.particles });
    else if (k === "labels") settings.set({ labels: settings.labels === "always" ? "hover" : "always" });
    else if (k === "truth") settings.set({ showTruth: !settings.showTruth });
    else setLocal((l) => ({ ...l, [k]: !l[k] }));
  };
  return [layers, toggle];
}

export default function CommandCenter() {
  const sim = useSim();
  const mode = useConnection((s) => s.mode);
  const check = useConnection((s) => s.check);
  const model = useLiveModel();
  const reduced = useReducedMotion();
  const { autoFocus, speed } = useSettings();
  const [layers, toggle] = useLayers();
  const e = sim.epochs[sim.cursor];

  // IDS detection -> investigation: open the first newly flagged node and frame the detections.
  useEffect(() => {
    if (!autoFocus || sim.phase !== "detect" || !e || !sim.animate) return;
    const prevFlagged = new Set(sim.epochs[sim.cursor - 1]?.detect.flagged ?? []);
    const fresh = e.detect.flagged.filter((n) => !prevFlagged.has(n));
    if (fresh.length) {
      sim.select({ kind: "node", id: fresh[0] });
      sim.focusOn(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.phase, sim.cursor]);

  const phaseLabel = sim.phase === "done" ? "" : sim.phase;
  const aria = model
    ? `Network of ${model.nodes.length} nodes in a ${model.area} metre square${e ? `, epoch ${e.epoch}${phaseLabel ? `, ${phaseLabel} stage` : ""}` : ""}`
    : "Network map";

  return (
    <div className="cc">
      <section className="cc__stage panel" aria-label="Live network">
        <div className="cc__stagebar">
          <KpiStrip />
        </div>
        <div className="cc__map">
          {mode === "offline" ? (
            <Empty title="No data source" action={<button className="btn btn--primary" onClick={() => void check()}>Check again</button>}>
              Start the server with <code className="mono">PYTHONPATH=. uvicorn manet_secure_routing.server.app:app</code> from the
              project folder, then check again.
            </Empty>
          ) : sim.status === "error" ? (
            <div style={{ padding: 16 }}>
              <ErrorNotice message={sim.error ?? "The simulation stopped."} onRetry={() => void sim.reset(sim.init?.params)} />
            </div>
          ) : !model ? (
            <Skeleton h={"100%" as unknown as number} style={{ height: "100%" }} />
          ) : (
            <TopologyField
              model={model}
              selection={sim.selection}
              onSelect={sim.select}
              focus={sim.focus}
              layers={layers}
              reduced={reduced || !sim.animate}
              nodeMoveMs={sim.phase === "deliver" ? deliverMs(speed) : 0}
              ariaLabel={aria}
            >
              <Legend layers={layers} onToggle={toggle} />
            </TopologyField>
          )}
        </div>
      </section>
      <Inspector />
      <section className="cc__bottom panel" aria-label="Epoch pipeline and events">
        <PipelineTrack />
        <EventTimeline />
      </section>
    </div>
  );
}
