"""Population-size (10-100) and chromosome-length (10-100 nodes) sweeps for every optimiser.

Uses a static network snapshot with attackers isolated from ground truth, so the sweep isolates
optimiser behaviour from IDS errors. Node density is held constant as the node count grows.
"""
import copy
import time
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from manet_secure_routing.src.integration.secure_router import algorithms
from manet_secure_routing.src.optimization.fitness import RouteFitness
from manet_secure_routing.src.simulation.manet_environment import MANETEnvironment
from manet_secure_routing.src.utils.logger import get_logger
from manet_secure_routing.src.utils.visualization import plot_lines

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"


def fitness_for(cfg, n_nodes, seed):
    cfg = copy.deepcopy(cfg)
    base_n = cfg["network"]["n_nodes"]
    cfg["network"]["n_nodes"] = n_nodes
    cfg["network"]["area"] *= np.sqrt(n_nodes / base_n)          # constant density
    cfg["network"]["n_destinations"] = min(cfg["network"]["n_destinations"], n_nodes // 3)
    env = MANETEnvironment(cfg, np.random.default_rng(seed))
    blocked = env.state.malicious
    D, A, q, _ = env.links(blocked)
    return RouteFitness(D, A, q, np.where(blocked, 0.0, 1.0), env.source, env.destinations,
                        cfg["traffic"], cfg["fitness"], cfg["network"]["radio_range"])


def main():
    cfg = yaml.safe_load(open(ROOT / "config" / "hcdso.yaml"))
    exp = yaml.safe_load(open(ROOT / "config" / "experiment.yaml"))
    sc, log = exp["scalability"], get_logger("scalability")
    algos = algorithms(cfg["optimizer"]["stall_limit"])
    rows = []
    sweeps = [("population", p, sc["fixed_dim"], p) for p in sc["populations"]] + \
             [("chromosome", d, d, sc["fixed_pop"]) for d in sc["chromosomes"]]
    for sweep, value, dim, pop in sweeps:
        for seed in exp["seeds"]:
            fit = fitness_for(cfg, dim, seed)
            for name in exp["algorithms"]:
                t0 = time.time()
                _, best, _ = algos[name](fit, dim, pop, sc["iters"], np.random.default_rng(seed))
                rows.append({"sweep": sweep, "value": value, "algorithm": name, "seed": seed,
                             "best_fitness": best, "runtime_s": time.time() - t0})
        log.info(f"{sweep} = {value} done")

    df = pd.DataFrame(rows)
    (RESULTS / "tables").mkdir(parents=True, exist_ok=True)
    df.to_csv(RESULTS / "tables" / "scalability_raw.csv", index=False)
    summary = df.groupby(["sweep", "value", "algorithm"]).agg(
        fitness_mean=("best_fitness", "mean"), fitness_std=("best_fitness", "std"), runtime_s=("runtime_s", "mean"))
    summary.to_csv(RESULTS / "tables" / "scalability_summary.csv", float_format="%.5f")

    for sweep, xlabel in [("population", "Population size"), ("chromosome", "Chromosome length (nodes)")]:
        s = summary.loc[sweep]
        xs = sorted(s.index.get_level_values("value").unique())
        for col, ylabel in [("fitness_mean", "Best fitness (lower is better)"), ("fitness_std", "Fitness std across seeds"),
                            ("runtime_s", "Runtime (s)")]:
            series = {a: s.xs(a, level="algorithm")[col].reindex(xs).to_numpy() for a in exp["algorithms"]}
            plot_lines(xs, series, xlabel, ylabel, f"{ylabel} vs {xlabel.lower()}",
                       RESULTS / "figures" / f"scalability_{sweep}_{col}.png")
    print(summary.groupby(["sweep", "algorithm"]).mean().round(4).to_string())


if __name__ == "__main__":
    main()
