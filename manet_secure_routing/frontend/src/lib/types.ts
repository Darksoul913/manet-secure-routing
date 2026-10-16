// Mirrors manet_secure_routing/server/app.py payloads.

export type Algorithm = "HCDSO" | "DSO" | "COA" | "POA" | "BCO";
export type DatasetKey = "cicids2017" | "nsl_kdd" | "kdd99";
export type Edge = [number, number];
export type Vec2 = [number, number];

export interface Health {
  ok: boolean;
  device: string;
  ids_dataset: DatasetKey;
  config_sha: string;
  checkpoints: Record<DatasetKey, boolean>;
}

export interface SimParams {
  seed: number;
  algorithm: Algorithm;
  ids_dataset: DatasetKey;
  n_nodes: number;
  area: number;
  radio_range: number;
  n_destinations: number;
  malicious_fraction: number;
  mean_speed: number;
  packet_rate: number;
  pop_size: number;
  iters: number;
  threshold: number;
}

export interface SimDefaults {
  params: SimParams;
  limits: Record<string, [number, number]>;
  algorithms: Algorithm[];
  ids_datasets: Partial<Record<DatasetKey, string>>;
}

export interface SimInit {
  type: "init";
  params: SimParams;
  ids_dataset: DatasetKey;
  area: number;
  radio_range: number;
  epoch_ms: number;
  threshold: number;
  positions: Vec2[];
  edges: Edge[];
  source: number;
  destinations: number[];
  truth: { malicious: number[]; attackers: Record<string, "blackhole" | "grayhole"> };
}

export interface Candidate {
  edges: Edge[];
  fitness: number;
}

export interface OptIteration {
  t: number;
  phase: string; // "COA" | "DSO" for HCDSO, otherwise the algorithm name
  best: number;
  mean: number;
  candidates: Candidate[];
}

export interface Objectives {
  energy: number;
  delay: number;
  hops: number;
  reliability: number;
  unreachable: number;
}

export interface Cumulative {
  time_ms: number;
  throughput_kbps: number;
  pdr: number;
  energy_j: number;
  delay_ms: number;
  hop_count: number;
  detection_rate: number;
  false_isolations: number;
}

export interface SimEpoch {
  type: "epoch";
  epoch: number;
  time_ms: number;
  pos_start: Vec2[];
  pos_end: Vec2[];
  speed: number[];
  detect: { scores: number[]; flow_probs: number[][]; flagged: number[]; suspicious: number[] };
  isolate: { blocked: number[]; removed_edges: Edge[]; invalidated: Edge[] };
  edges_safe: Edge[];
  edges_end: Edge[];
  optimize: { algorithm: Algorithm; iterations: OptIteration[]; fitness: number };
  route: { edges: Edge[]; objectives: Objectives; problems: string[]; valid: boolean };
  deliver: {
    links: [number, number, number, number][]; // u, child, forwarded by u, received by child
    sent: number;
    delivered: number;
    energy: number;
    delay_ms: number;
    node_energy: number[];
  };
  cumulative: Cumulative;
}

export interface IdsModelRow {
  model: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  fnr: number;
  train_s: number;
}

export interface Confusion {
  tp: number;
  fn: number;
  fp: number;
  tn: number;
}

export interface IdsDatasetResult {
  label: string;
  models: IdsModelRow[];
  recorded: string | null;
  test?: { rows: number; attacks: number; benign: number };
  confusion?: Record<string, Confusion>;
}

export type IdsResults = Partial<Record<DatasetKey, IdsDatasetResult>>;

export interface RoutingRow {
  algorithm: Algorithm;
  time_ms: number;
  throughput_kbps: number;
  pdr: number;
  energy_j: number;
  delay_ms: number;
  hop_count: number;
  detection_rate: number;
  false_isolations: number;
}

export interface ImprovementRow {
  vs: Algorithm;
  throughput_kbps: number;
  pdr: number;
  energy_j: number;
  delay_ms: number;
  hop_count: number;
}

export interface RoutingResults {
  mean: RoutingRow[];
  std: RoutingRow[];
  improvement: ImprovementRow[];
  seeds: number[];
  recorded: string | null;
  ids_dataset: DatasetKey;
}

export interface ScalabilityRow {
  sweep: "population" | "chromosome";
  value: number;
  algorithm: Algorithm;
  fitness_mean: number;
  fitness_std: number;
  runtime_s: number;
}

export interface ScalabilityResults {
  rows: ScalabilityRow[];
  recorded: string | null;
}

export interface ArenaRun {
  curve: number[];
  best: number;
  phases: string[];
  runtime_s: number;
  objectives: Objectives;
  edges: Edge[];
}

export interface ArenaResult {
  seed: number;
  pop_size: number;
  iters: number;
  area: number;
  positions: Vec2[];
  edges: Edge[];
  blocked: number[];
  source: number;
  destinations: number[];
  runs: Record<Algorithm, ArenaRun>;
}

export interface ScriptInfo {
  title: string;
  outputs: string[];
  minutes: number;
}

export interface RunRecord {
  id: string;
  script: string;
  status: "running" | "succeeded" | "failed";
  started: string;
  finished?: string;
  duration_s?: number;
  returncode?: number;
  config_sha: string;
  python: string;
  device: string;
  log: string;
}

export interface ConfigFile {
  values: Record<string, unknown>;
  text: string;
}

export interface ConfigBundle {
  md_lstm: ConfigFile;
  hcdso: ConfigFile;
  experiment: ConfigFile;
  sha: string;
}

export interface DemoBundle {
  captured: string;
  note: string;
  health: Health;
  defaults: SimDefaults;
  config: ConfigBundle;
  ids: IdsResults;
  routing: RoutingResults;
  scalability: ScalabilityResults;
  arena: ArenaResult;
  files: { tables: string[]; figures: string[] };
  session: { init: SimInit; epochs: SimEpoch[] };
}
