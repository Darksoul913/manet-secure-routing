"""HCDSO vs BCO, POA, COA, DSO inside the closed-loop secure MANET, over 100-1000 ms of simulation.

One 1000 ms run per (algorithm, seed); cumulative metrics are read off at every 100 ms epoch.
Requires a trained IDS: run exp_dataset2.py (or the dataset named by `ids_dataset`) first.
"""
import time
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from manet_secure_routing.src.integration.attack_mitigation import load_ids
from manet_secure_routing.src.integration.framework import simulate
from manet_secure_routing.src.integration.secure_router import algorithms
from manet_secure_routing.src.training.train_md_lstm import get_device
from manet_secure_routing.src.utils.logger import get_logger
from manet_secure_routing.src.utils.visualization import plot_lines

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
METRICS = {
    "throughput_kbps": ("Throughput (kbps)", "max"),
    "pdr": ("Packet delivery ratio", "max"),
    "energy_j": ("Energy consumed (J)", "min"),
    "delay_ms": ("End-to-end delay (ms)", "min"),
    "hop_count": ("Hop count", "min"),
}


def improvement(ours, theirs, better):
    """Percent improvement of `ours` over `theirs` (positive = ours is better)."""
    return 100 * ((ours - theirs) if better == "max" else (theirs - ours)) / theirs


def main():
    cfg = yaml.safe_load(open(ROOT / "config" / "hcdso.yaml"))
    exp = yaml.safe_load(open(ROOT / "config" / "experiment.yaml"))
    log = get_logger("routing")
    device = get_device()
    ds = exp["ids_dataset"]
    ckpt = RESULTS / "models" / f"md_lstm_{ds}.pt"
    if not ckpt.exists():
        raise SystemExit(f"{ckpt} not found -- train the IDS first (experiments/exp_dataset*.py for {ds}).")
    ids = load_ids(ckpt, device)
    pool = np.load(RESULTS / "models" / f"{ds}_test.npz")
    flow_pool = (pool["X"], pool["y"])

    algos = algorithms(cfg["optimizer"]["stall_limit"])
    sim_ms = max(exp["routing"]["sim_times_ms"])
    rows = []
    for seed in exp["seeds"]:
        for name in exp["algorithms"]:
            t0 = time.time()
            for h in simulate(cfg, algos[name], ids, flow_pool, device, sim_ms, seed):
                rows.append({"algorithm": name, "seed": seed, **h})
            log.info(f"seed {seed} {name:6s} PDR {h['pdr']:.3f} thr {h['throughput_kbps']:.0f} kbps "
                     f"E {h['energy_j']:.2f} J delay {h['delay_ms']:.1f} ms hops {h['hop_count']:.2f} "
                     f"det {h['detection_rate']:.2f} ({time.time() - t0:.0f}s)")

    raw = pd.DataFrame(rows)
    raw = raw[raw["time_ms"].isin(exp["routing"]["sim_times_ms"])]
    (RESULTS / "tables").mkdir(parents=True, exist_ok=True)
    (RESULTS / "figures").mkdir(parents=True, exist_ok=True)
    raw.to_csv(RESULTS / "tables" / "routing_raw.csv", index=False)
    mean = raw.groupby(["algorithm", "time_ms"]).mean(numeric_only=True).drop(columns="seed")
    mean.to_csv(RESULTS / "tables" / "routing_mean.csv", float_format="%.5f")

    times = exp["routing"]["sim_times_ms"]
    for key, (label, _) in METRICS.items():
        series = {a: mean.loc[a, key].reindex(times).to_numpy() for a in exp["algorithms"]}
        plot_lines(times, series, "Simulation time (ms)", label, f"{label} vs simulation time",
                   RESULTS / "figures" / f"routing_{key}.png")

    # HCDSO's improvement over each baseline, averaged across all simulation times.
    imp = {}
    for a in exp["algorithms"]:
        if a == "HCDSO":
            continue
        imp[a] = {key: improvement(mean.loc["HCDSO", key].mean(), mean.loc[a, key].mean(), better)
                  for key, (_, better) in METRICS.items()}
    imp = pd.DataFrame(imp).T
    imp.index.name = "vs"
    imp.to_csv(RESULTS / "tables" / "routing_hcdso_improvement_pct.csv", float_format="%.2f")
    print("\nMean over 100-1000 ms:\n", mean.groupby("algorithm").mean()[list(METRICS)].round(4).to_string())
    print("\nHCDSO improvement (%):\n", imp.round(2).to_string())


if __name__ == "__main__":
    main()
