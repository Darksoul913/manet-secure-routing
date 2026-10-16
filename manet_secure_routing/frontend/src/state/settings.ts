import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

// localStorage can be missing or throw (private mode, blocked storage); settings then live for the session only.
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export type MotionPref = "system" | "full" | "reduced";

export interface Settings {
  motion: MotionPref;
  speed: number; // playback multiplier
  autoFocus: boolean; // jump to a node when the IDS flags it
  showTruth: boolean; // overlay simulator ground truth
  labels: "hover" | "always";
  particles: boolean;
  railCollapsed: boolean;
  set: (patch: Partial<Omit<Settings, "set">>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      motion: "system",
      speed: 1,
      autoFocus: true,
      showTruth: false,
      labels: "hover",
      particles: true,
      railCollapsed: false,
      set: (patch) => set(patch),
    }),
    { name: "mesh-sentinel-settings", storage: createJSONStorage(() => safeStorage) },
  ),
);

export function prefersReducedMotion(pref: MotionPref) {
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion() {
  return prefersReducedMotion(useSettings((s) => s.motion));
}
