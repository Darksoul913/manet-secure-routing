import { motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink } from "react-router-dom";
import { PAGES } from "../../lib/routes";
import { useReducedMotion, useSettings } from "../../state/settings";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#08636D" />
      <g stroke="#9ED8D3" strokeWidth="1.5">
        <path d="M9 22 16 9l7 13M9 22h14M16 9v13" />
      </g>
      <g fill="#43BDB6">
        <circle cx="16" cy="9" r="2.6" />
        <circle cx="9" cy="22" r="2.6" />
        <circle cx="23" cy="22" r="2.6" />
      </g>
      <circle cx="16" cy="17" r="2" fill="#fff" />
    </svg>
  );
}

export function Sidebar() {
  const collapsed = useSettings((s) => s.railCollapsed);
  const set = useSettings((s) => s.set);
  const reduced = useReducedMotion();
  const main = PAGES.filter((p) => p.path !== "/settings");
  const settings = PAGES.find((p) => p.path === "/settings")!;

  const item = (p: (typeof PAGES)[number]) => (
    <NavLink
      key={p.path}
      to={p.path}
      end={p.path === "/"}
      className={({ isActive }) => `rail__item ${isActive ? "is-active" : ""}`}
      title={collapsed ? p.label : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="rail-active"
              className="rail__active"
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <p.icon size={18} strokeWidth={1.7} className="rail__icon" aria-hidden="true" />
          <span className="rail__label">{p.label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <motion.nav
      className={`rail ${collapsed ? "rail--collapsed" : ""}`}
      aria-label="Main"
      animate={{ width: collapsed ? 60 : 232 }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38 }}
      initial={false}
    >
      <div className="rail__brand">
        <Logo />
        <span className="rail__name">Mesh Sentinel</span>
      </div>
      <div className="rail__items">{main.map(item)}</div>
      <div className="rail__foot">
        {item(settings)}
        <button
          className="rail__item rail__collapse"
          onClick={() => set({ railCollapsed: !collapsed })}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.7} /> : <PanelLeftClose size={18} strokeWidth={1.7} />}
          <span className="rail__label">Collapse</span>
        </button>
      </div>
    </motion.nav>
  );
}
