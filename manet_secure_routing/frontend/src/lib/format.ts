const nf = (d: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = {
  num: (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v) ? "—" : nf(d).format(v)),
  pct: (v: number | null | undefined, d = 1) => (v == null ? "—" : `${nf(d).format(v * 100)}%`),
  signedPct: (v: number | null | undefined, d = 1) =>
    v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(d).format(Math.abs(v))}%`,
  kbps: (v: number | null | undefined) =>
    v == null ? "—" : v >= 1000 ? `${nf(2).format(v / 1000)} Mbps` : `${nf(0).format(v)} kbps`,
  ms: (v: number | null | undefined, d = 1) => (v == null ? "—" : `${nf(d).format(v)} ms`),
  joules: (v: number | null | undefined, d = 2) => (v == null ? "—" : `${nf(d).format(v)} J`),
  simTime: (ms: number) => `${(ms / 1000).toFixed(3)} s`,
  coord: (v: number) => `${v.toFixed(1)} m`,
  date: (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—",
  duration: (s: number | null | undefined) =>
    s == null ? "—" : s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`,
};

export const DATASET_LABEL: Record<string, string> = {
  cicids2017: "CICIDS2017",
  nsl_kdd: "NSL-KDD",
  kdd99: "KDD99",
};
