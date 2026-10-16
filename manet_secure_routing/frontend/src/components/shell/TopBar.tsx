import { AnimatePresence, motion } from "motion/react";
import { Bell, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fmt } from "../../lib/format";
import { PAGES } from "../../lib/routes";
import { useConnection } from "../../state/connection";
import { useReducedMotion } from "../../state/settings";
import { useSim, visibleEvents } from "../../state/sim";
import { SeverityIcon } from "../ui/primitives";
import { SimControls, SimStatus } from "./SimControls";

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { pathname } = useLocation();
  const page = PAGES.find((p) => p.path === pathname) ?? PAGES[0];
  return (
    <header className="topbar">
      <div className="topbar__title">
        <h1>{page.title}</h1>
        <p className="topbar__desc">{page.description}</p>
      </div>
      <div className="spacer" />
      {page.sim && <SimStatus />}
      <ConnectionBadge />
      <button className="btn topbar__search" onClick={onOpenPalette} aria-label="Open command launcher">
        <Search size={14} />
        <span className="topbar__search-label">Search or run a command</span>
        <span className="kbd">⌘K</span>
      </button>
      <Notifications />
      <Link to="/settings" className="btn btn--ghost btn--icon topbar__settings" aria-label="Settings" title="Settings">
        <Settings2 size={16} />
      </Link>
      {page.sim && <SimControls />}
    </header>
  );
}

function ConnectionBadge() {
  const { mode, health, check } = useConnection();
  const map = {
    checking: ["Connecting…", "neutral", "Checking for the Mesh Sentinel server"],
    live: ["Live", "ok", `Connected to the simulator on ${health?.device ?? "?"}, config ${health?.config_sha ?? ""}`],
    demo: ["Recorded demo", "warn", "Server not reachable: replaying a session captured from the real simulator"],
    offline: ["Offline", "crit", "Neither the server nor the recorded demo could be loaded"],
  } as const;
  const [label, tone, title] = map[mode];
  return (
    <button className={`conn conn--${tone}`} onClick={() => void check()} title={`${title}. Click to re-check.`}>
      <span className={`dot dot--${tone}`} aria-hidden="true" />
      <span className="conn__label">{label}</span>
    </button>
  );
}

function Notifications() {
  const sim = useSim();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => visibleEvents(sim), [sim.events, sim.cursor, sim.phase, sim.epochs]); // eslint-disable-line react-hooks/exhaustive-deps
  const alerts = visible.filter((e) => e.severity === "critical" || e.severity === "warning");
  const unread = visible.slice(sim.seenEvents).filter((e) => e.severity === "critical" || e.severity === "warning").length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="notif" ref={ref}>
      <button
        className="btn btn--ghost btn--icon"
        aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={16} />
        {unread > 0 && <span className="notif__badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="popover notif__panel"
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            role="dialog"
            aria-label="Alerts"
          >
            <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
              <strong>Alerts</strong>
              <span className="muted">from this session</span>
              <div className="spacer" />
              <button className="btn btn--sm" onClick={sim.markSeen} disabled={!unread}>
                Mark all read
              </button>
            </div>
            {alerts.length === 0 ? (
              <p className="secondary" style={{ padding: 14 }}>
                No threats or route losses yet.
              </p>
            ) : (
              <ul className="notif__list">
                {alerts
                  .slice(-30)
                  .reverse()
                  .map((ev) => (
                    <li key={ev.id}>
                      <button
                        onClick={() => {
                          if (ev.target === "node" && ev.nodes.length) sim.select({ kind: "node", id: ev.nodes[0] });
                          if (ev.nodes.length) sim.focusOn(ev.nodes);
                          setOpen(false);
                        }}
                      >
                        <SeverityIcon severity={ev.severity} />
                        <span className="notif__text">
                          <span>{ev.title}</span>
                          <span className="muted mono small">{fmt.simTime(ev.time_ms)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
