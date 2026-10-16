import { useEffect, useRef } from "react";
import type { Vec2 } from "../../lib/types";
import type { TrafficLink } from "./model";

interface Props {
  traffic: TrafficLink[];
  positions: Vec2[];
  durationMs: number;
  runKey: string;
  radius: number;
}

/**
 * Packet particles for one delivery phase. Every dot sits on a real tree link, moves in the real
 * forwarding direction (parent -> child), and the number of dots per link follows the packets the
 * simulator delivered on it. Links that lost packets also show one dot that fades out mid-hop.
 */
export function Particles({ traffic, positions, durationMs, runKey, radius }: Props) {
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const g = groupRef.current;
    if (!g || !traffic.length || durationMs <= 0) return;
    const maxRecv = Math.max(1, ...traffic.map((t) => t.received));
    type Dot = { el: SVGCircleElement; a: Vec2; b: Vec2; offset: number; lost: boolean };
    const dots: Dot[] = [];
    const ns = "http://www.w3.org/2000/svg";
    for (const t of traffic) {
      const a = positions[t.from];
      const b = positions[t.to];
      if (!a || !b) continue;
      const n = t.received > 0 ? Math.max(1, Math.round((t.received / maxRecv) * 4)) : 0;
      for (let i = 0; i < n; i++) dots.push({ el: document.createElementNS(ns, "circle"), a, b, offset: i / n, lost: false });
      if (t.forwarded > t.received) dots.push({ el: document.createElementNS(ns, "circle"), a, b, offset: 0.5, lost: true });
    }
    for (const d of dots) {
      d.el.setAttribute("r", String(d.lost ? radius * 0.8 : radius));
      d.el.setAttribute("class", d.lost ? "particle particle--lost" : "particle");
      g.appendChild(d.el);
    }
    const hop = 900; // ms for one dot to cross a link
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const fadeOut = Math.min(1, Math.max(0, (durationMs - elapsed) / 300));
      for (const d of dots) {
        let p = ((elapsed / hop + d.offset) % 1 + 1) % 1;
        let opacity = fadeOut;
        if (d.lost) {
          p = Math.min(p, 0.55);
          opacity *= p < 0.35 ? 1 : Math.max(0, 1 - (p - 0.35) / 0.2);
        }
        d.el.setAttribute("cx", String(d.a[0] + (d.b[0] - d.a[0]) * p));
        d.el.setAttribute("cy", String(d.a[1] + (d.b[1] - d.a[1]) * p));
        d.el.setAttribute("opacity", String(opacity));
      }
      if (elapsed < durationMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      dots.forEach((d) => d.el.remove());
    };
    // runKey identifies one delivery phase; positions are read at its start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, durationMs]);

  return <g ref={groupRef} aria-hidden="true" />;
}
