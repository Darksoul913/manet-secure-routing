import { AnimatePresence, motion } from "motion/react";
import { History } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "../../lib/format";
import { KIND_LABEL, type SimEvent } from "../../state/events";
import { useReducedMotion } from "../../state/settings";
import { useSim, visibleEvents } from "../../state/sim";
import { Segmented, SeverityIcon } from "../ui/primitives";

type Filter = "all" | "threats" | "routing";
const THREAT_KINDS = new Set(["anomaly", "predicted", "mitigation", "isolated", "withheld", "released"]);

export function EventTimeline() {
  const sim = useSim();
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const listRef = useRef<HTMLOListElement>(null);
  const all = useMemo(() => visibleEvents(sim), [sim.events, sim.cursor, sim.phase, sim.epochs]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all.filter((e) =>
    filter === "all" ? true : filter === "threats" ? THREAT_KINDS.has(e.kind) : !THREAT_KINDS.has(e.kind),
  );
  const current = sim.epochs[sim.cursor]?.epoch;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [shown.length, reduced]);

  const inspect = (ev: SimEvent) => {
    const epochIndex = sim.epochs.findIndex((x) => x.epoch === ev.epoch);
    if (epochIndex !== sim.cursor && epochIndex >= 0) sim.seek(epochIndex);
    if (ev.target === "node" && ev.nodes.length) sim.select({ kind: "node", id: ev.nodes[0] });
    else if (ev.target === "route") sim.select({ kind: "route" });
    if (ev.nodes.length) sim.focusOn(ev.nodes);
  };

  return (
    <div className="timeline">
      <div className="timeline__head">
        <h2 className="panel__title">Events</h2>
        <Segmented
          label="Filter events"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "threats", label: "Threats" },
            { value: "routing", label: "Routing" },
          ]}
        />
        <div className="spacer" />
        <Scrubber />
      </div>
      {shown.length === 0 ? (
        <p className="timeline__empty">
          {sim.init ? "Events appear here as each epoch runs." : "Start a simulation to see detection, isolation and routing events."}
        </p>
      ) : (
        <ol className="timeline__list" ref={listRef} aria-live="polite" aria-relevant="additions">
          <AnimatePresence initial={false}>
            {shown.map((ev) => (
              <motion.li
                key={ev.id}
                className={`event ${ev.epoch === current ? "" : "event--past"}`}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
              >
                <button className="event__btn" onClick={() => inspect(ev)} title="Show on map">
                  <span className="event__time mono">{fmt.simTime(ev.time_ms)}</span>
                  <SeverityIcon severity={ev.severity} />
                  <span className="event__kind">{KIND_LABEL[ev.kind]}</span>
                  <span className="event__title">{ev.title}</span>
                  <span className="event__detail">{ev.detail}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

/** Replays recorded epochs: every received epoch is kept, so scrubbing shows exactly what happened. */
function Scrubber() {
  const epochs = useSim((s) => s.epochs);
  const cursor = useSim((s) => s.cursor);
  const seek = useSim((s) => s.seek);
  if (epochs.length < 2) return null;
  return (
    <label className="scrubber">
      <History size={14} aria-hidden="true" />
      <span className="visually-hidden">Replay epoch</span>
      <input
        type="range"
        min={0}
        max={epochs.length - 1}
        value={Math.max(0, cursor)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-valuetext={`Epoch ${Math.max(0, cursor) + 1} of ${epochs.length}`}
      />
      <span className="mono scrubber__value">
        {Math.max(0, cursor) + 1}/{epochs.length}
      </span>
    </label>
  );
}
