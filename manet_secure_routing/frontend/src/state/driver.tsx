import { useEffect } from "react";
import { prefersReducedMotion, useSettings } from "./settings";
import { useSim } from "./sim";
import { EPOCH_MS, PHASES, REDUCED_EPOCH_MS } from "./events";

/**
 * Walks the on-screen epoch through detect -> isolate -> optimize -> route -> deliver.
 * Playback pacing is purely presentational; every state shown comes from the received epoch.
 */
export function SimDriver() {
  const cursor = useSim((s) => s.cursor);
  const animate = useSim((s) => s.animate);
  const speed = useSettings((s) => s.speed);
  const motion = useSettings((s) => s.motion);

  useEffect(() => {
    const sim = useSim.getState();
    const epoch = sim.epochs[cursor];
    if (!epoch || !animate) return;
    const reduced = prefersReducedMotion(motion);
    const total = (reduced ? REDUCED_EPOCH_MS : EPOCH_MS) / speed;
    const timers: number[] = [];
    let at = 0;

    if (sim.playing) sim.prefetch();
    for (const p of PHASES) {
      const start = at;
      timers.push(window.setTimeout(() => useSim.getState().setPhase(p.key, p.key === "optimize" ? 0 : undefined), start));
      if (p.key === "optimize" && !reduced) {
        const n = epoch.optimize.iterations.length;
        const span = total * p.share;
        for (let i = 1; i < n; i++) {
          timers.push(window.setTimeout(() => useSim.getState().setPhase("optimize", i), start + (span * i) / n));
        }
      }
      at += total * p.share;
    }
    timers.push(
      window.setTimeout(() => {
        const s = useSim.getState();
        s.setPhase("done", Math.max(0, epoch.optimize.iterations.length - 1));
        if (s.playing) void s.advance();
      }, at),
    );
    return () => timers.forEach(clearTimeout);
  }, [cursor, animate, speed, motion]);

  return null;
}
