import { motion } from "motion/react";
import { PHASES, PHASE_INDEX } from "../../state/events";
import { useReducedMotion } from "../../state/settings";
import { useSim } from "../../state/sim";

/** The per-epoch sequence the backend runs, with what each stage produced for the epoch on screen. */
export function PipelineTrack() {
  const e = useSim((s) => s.epochs[s.cursor]);
  const phase = useSim((s) => s.phase);
  const iter = useSim((s) => s.iter);
  const reduced = useReducedMotion();
  const pi = phase === "done" ? 5 : PHASE_INDEX[phase];

  const readout: Record<string, string> = e
    ? {
        detect: `${e.detect.flagged.length} flagged`,
        isolate: `${e.isolate.blocked.length} isolated`,
        optimize:
          pi === PHASE_INDEX.optimize
            ? `${iter + 1}/${e.optimize.iterations.length} · ${e.optimize.iterations[iter]?.phase ?? ""}`
            : `${e.optimize.iterations.length} iterations`,
        route: `${e.route.edges.length} links${e.route.valid ? ", valid" : ", invalid"}`,
        deliver: `${e.deliver.delivered}/${e.deliver.sent} packets`,
      }
    : {};

  return (
    <ol className="pipeline" aria-label={e ? `Epoch ${e.epoch} pipeline` : "Epoch pipeline"}>
      {PHASES.map((p, i) => {
        const state = !e ? "idle" : i < pi ? "done" : i === pi ? "active" : "next";
        return (
          <li key={p.key} className={`pipeline__step pipeline__step--${state}`} aria-current={state === "active" ? "step" : undefined}>
            {state === "active" && (
              <motion.div
                layoutId="pipeline-active"
                className="pipeline__active"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <span className="pipeline__num">{i + 1}</span>
            <span className="pipeline__text">
              <span className="pipeline__name">{p.label}</span>
              <span className="pipeline__readout mono">{readout[p.key] ?? "—"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
