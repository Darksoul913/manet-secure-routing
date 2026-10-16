import type {
  ArenaResult,
  ConfigBundle,
  Health,
  IdsResults,
  RoutingResults,
  RunRecord,
  ScalabilityResults,
  ScriptInfo,
  SimDefaults,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = init?.timeoutMs ? setTimeout(() => ctrl.abort(), init.timeoutMs) : undefined;
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      let detail: string | undefined;
      try {
        detail = (await res.json()).detail;
      } catch {
        /* body was not JSON */
      }
      throw new ApiError(detail ?? `${res.status} ${res.statusText}`, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => fetchJson<Health>("/api/health", { timeoutMs: 2500 }),
  defaults: () => fetchJson<SimDefaults>("/api/sim/defaults"),
  config: () => fetchJson<ConfigBundle>("/api/config"),
  ids: () => fetchJson<IdsResults>("/api/results/ids"),
  routing: () => fetchJson<RoutingResults>("/api/results/routing"),
  scalability: () => fetchJson<ScalabilityResults>("/api/results/scalability"),
  files: () => fetchJson<{ tables: string[]; figures: string[] }>("/api/files"),
  arena: (seed: number, pop: number, iters: number) =>
    fetchJson<ArenaResult>(`/api/arena/convergence?seed=${seed}&pop_size=${pop}&iters=${iters}`),
  experiments: () => fetchJson<{ scripts: Record<string, ScriptInfo>; runs: RunRecord[] }>("/api/experiments"),
  runExperiment: (name: string) => fetchJson<RunRecord>(`/api/experiments/${name}/run`, { method: "POST" }),
  runLog: (id: string) => fetchJson<{ lines: string[]; total: number }>(`/api/experiments/runs/${id}/log`),
};

export function simSocketUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/sim`;
}
