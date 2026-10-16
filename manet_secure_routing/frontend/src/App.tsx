import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { CommandPalette } from "./components/shell/CommandPalette";
import { Sidebar } from "./components/shell/Sidebar";
import { TopBar } from "./components/shell/TopBar";
import { fmt } from "./lib/format";
import CommandCenter from "./pages/CommandCenter";
import Experiments from "./pages/Experiments";
import MeshSimulator from "./pages/MeshSimulator";
import ResultsStudio from "./pages/ResultsStudio";
import RoutingArena from "./pages/RoutingArena";
import SettingsPage from "./pages/Settings";
import ThreatIntel from "./pages/ThreatIntel";
import { useConnection } from "./state/connection";
import { SimDriver } from "./state/driver";
import { useReducedMotion } from "./state/settings";
import { useSim } from "./state/sim";

export default function App() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const [palette, setPalette] = useState(false);
  const { mode, demo, check } = useConnection();

  useEffect(() => {
    void check();
  }, [check]);

  // Prepare a network as soon as a data source is known, so the map is never empty.
  useEffect(() => {
    if ((mode === "live" || mode === "demo") && useSim.getState().status === "idle") void useSim.getState().reset();
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flush = location.pathname === "/";

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <div className="shell">
        <Sidebar />
        <div className="main">
          <TopBar onOpenPalette={() => setPalette(true)} />
          <div>
            {mode === "demo" && demo && (
              <div className="demo-banner" role="status">
                <History size={15} aria-hidden="true" />
                <span>
                  <strong>Recorded demo.</strong> The server is not reachable, so you are viewing results and a simulation session captured
                  from it on {fmt.date(demo.captured)}. Start the server and re-check to go live.
                </span>
              </div>
            )}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.main
              key={location.pathname}
              className={`page ${flush ? "page--flush" : ""}`}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <Routes location={location}>
                <Route path="/" element={<CommandCenter />} />
                <Route path="/simulator" element={<MeshSimulator />} />
                <Route path="/threats" element={<ThreatIntel />} />
                <Route path="/arena" element={<RoutingArena />} />
                <Route path="/experiments" element={<Experiments />} />
                <Route path="/results" element={<ResultsStudio />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<CommandCenter />} />
              </Routes>
            </motion.main>
          </AnimatePresence>
        </div>
      </div>
      <SimDriver />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </MotionConfig>
  );
}
