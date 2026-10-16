"""Hybrid Coati-Dolphin Swarm Optimization (HCDSO).

Each iteration runs either a full COA step (strong exploration) or a full DSO step (cooperative
exploitation) on the shared population. The choice is adaptive:
  * each operator earns credit = relative improvement of the population it produced (decaying average),
    and is picked with probability proportional to its credit (kept in [P_MIN, 1 - P_MIN]);
  * if the global best stalls for `stall_limit` iterations, the other operator is forced.
"""
import numpy as np

from manet_secure_routing.src.optimization.coa import coa_step
from manet_secure_routing.src.optimization.dso import dso_step
from manet_secure_routing.src.optimization.population import evaluate, init_population

P_MIN = 0.15
DECAY = 0.7


def hcdso(f, dim, pop_size, iters, rng, stall_limit=5, on_iter=None):
    X = init_population(pop_size, dim, rng)
    F = evaluate(f, X)
    steps = {"COA": coa_step, "DSO": dso_step}
    credit = {"COA": 1.0, "DSO": 1.0}
    best, stall, last, curve = F.min(), 0, "COA", []

    for t in range(1, iters + 1):
        p_dso = np.clip(credit["DSO"] / (credit["COA"] + credit["DSO"]), P_MIN, 1 - P_MIN)
        mode = "DSO" if rng.random() < p_dso else "COA"
        if stall >= stall_limit:
            mode, stall = ("COA" if last == "DSO" else "DSO"), 0

        before = F.mean()
        X, F = steps[mode](f, X, F, t, iters, rng)
        gain = (before - F.mean()) / (abs(before) + 1e-12)
        credit[mode] = DECAY * credit[mode] + (1 - DECAY) * max(gain, 0) * 100 + 1e-3

        stall = 0 if F.min() < best - 1e-12 else stall + 1
        best, last = min(best, F.min()), mode
        curve.append(best)
        if on_iter:
            on_iter(t, X, F, mode)

    i = F.argmin()
    return X[i].copy(), F[i], np.array(curve)
