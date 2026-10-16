import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { api, fetchJson } from "../lib/api";
import type { DemoBundle, Health } from "../lib/types";

/**
 * live    - the FastAPI server answered; everything is real and current.
 * demo    - the server is unreachable; screens replay a bundle captured from the real server earlier.
 * offline - neither the server nor the demo bundle could be loaded.
 */
export type Mode = "checking" | "live" | "demo" | "offline";

interface ConnectionState {
  mode: Mode;
  health?: Health;
  demo?: DemoBundle;
  checkedAt?: number;
  check: () => Promise<void>;
}

export const useConnection = create<ConnectionState>((set, get) => ({
  mode: "checking",
  check: async () => {
    set({ mode: "checking" });
    try {
      const health = await api.health();
      set({ mode: "live", health, checkedAt: Date.now() });
    } catch {
      try {
        const demo = get().demo ?? (await fetchJson<DemoBundle>("/demo/bundle.json"));
        set({ mode: "demo", demo, health: demo.health, checkedAt: Date.now() });
      } catch {
        set({ mode: "offline", checkedAt: Date.now() });
      }
    }
  },
}));

interface Resource<T> {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
}

/** Load from the live API, or from the captured demo bundle when the server is unreachable. */
export function useResource<T>(live: () => Promise<T>, demo: (d: DemoBundle) => T | undefined): Resource<T> {
  const mode = useConnection((s) => s.mode);
  const bundle = useConnection((s) => s.demo);
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (mode === "checking") return;
    if (mode === "demo" && bundle) {
      const data = demo(bundle);
      setState(data === undefined ? { loading: false, error: "Not included in the recorded demo." } : { data, loading: false });
      return;
    }
    if (mode === "offline") {
      setState({ loading: false, error: "The Mesh Sentinel server is not reachable." });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: undefined }));
    live()
      .then((data) => !cancelled && setState({ data, loading: false }))
      .catch((e: Error) => !cancelled && setState({ loading: false, error: e.message }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, bundle, nonce]);

  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
