import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Crosshair, Eye, Pause, Play, RotateCcw, Search, StepForward, Tag, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PAGES } from "../../lib/routes";
import { useReducedMotion, useSettings } from "../../state/settings";
import { useSim } from "../../state/sim";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const sim = useSim();
  const settings = useSettings();
  const reduced = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = PAGES.map((p) => ({
      id: `go-${p.path}`, label: p.label, hint: "Go to page", icon: p.icon, run: () => navigate(p.path),
    }));
    if (sim.init) {
      list.push(
        sim.playing
          ? { id: "pause", label: "Pause simulation", hint: "Playback", icon: Pause, run: sim.pause }
          : { id: "play", label: "Play simulation", hint: "Playback", icon: Play, run: sim.play },
        { id: "step", label: "Run one epoch", hint: "Playback", icon: StepForward, run: () => void sim.advance() },
        { id: "reset", label: "Reset simulation", hint: "Playback", icon: RotateCcw, run: () => void sim.reset(sim.init?.params) },
      );
      const n = Number(q.trim().replace(/^node\s*/i, ""));
      if (q.trim() && Number.isInteger(n) && n >= 0 && n < sim.init.positions.length) {
        list.unshift({
          id: `node-${n}`, label: `Inspect node ${n}`, hint: "Map", icon: Crosshair,
          run: () => {
            navigate("/");
            sim.select({ kind: "node", id: n });
            sim.focusOn([n]);
          },
        });
      }
    }
    list.push(
      {
        id: "truth", label: settings.showTruth ? "Hide ground truth overlay" : "Show ground truth overlay", hint: "Map",
        icon: Eye, run: () => settings.set({ showTruth: !settings.showTruth }),
      },
      {
        id: "labels", label: settings.labels === "always" ? "Show node IDs on hover only" : "Always show node IDs", hint: "Map",
        icon: Tag, run: () => settings.set({ labels: settings.labels === "always" ? "hover" : "always" }),
      },
    );
    return list;
  }, [sim, settings, navigate, q]);

  const filtered = commands.filter((c) => c.id.startsWith("node-") || c.label.toLowerCase().includes(q.trim().toLowerCase()));
  const run = (c?: Command) => {
    if (!c) return;
    c.run();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="palette__backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="palette popover"
            role="dialog"
            aria-modal="true"
            aria-label="Command launcher"
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            <div className="palette__input">
              <Search size={16} aria-hidden="true" />
              <input
                ref={inputRef}
                value={q}
                placeholder="Search pages, actions, or type a node number"
                aria-label="Command"
                aria-controls="palette-list"
                aria-activedescendant={filtered[active] ? `cmd-${filtered[active].id}` : undefined}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(filtered.length - 1, a + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === "Enter") run(filtered[active]);
                  else if (e.key === "Escape") onClose();
                }}
              />
              <span className="kbd">Esc</span>
            </div>
            <ul className="palette__list" id="palette-list" role="listbox">
              {filtered.length === 0 && <li className="palette__empty">No matching command.</li>}
              {filtered.map((c, i) => (
                <li
                  key={c.id}
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={`palette__item ${i === active ? "is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                >
                  <c.icon size={16} />
                  <span>{c.label}</span>
                  <span className="muted small" style={{ marginLeft: "auto" }}>
                    {c.hint}
                  </span>
                  {i === active && <CornerDownLeft size={13} className="muted" />}
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
