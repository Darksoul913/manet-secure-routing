"""Comparison routing optimisers: BCO (artificial bee colony) and POA (pelican optimisation)."""
import numpy as np

from manet_secure_routing.src.optimization.population import clip, evaluate, greedy, run


def _bco_step(f, X, F, t, T, rng, trials, limit):
    """Artificial Bee Colony (Karaboga, 2005): employed bees, onlookers, scouts."""
    n, d = X.shape

    def neighbour_moves(idx):
        k = rng.integers(n - 1, size=len(idx))
        k += k >= idx                      # partner != self
        j = rng.integers(d, size=len(idx))
        V = X[idx].copy()
        V[np.arange(len(idx)), j] += rng.uniform(-1, 1, len(idx)) * (X[idx, j] - X[k, j])
        V = clip(V)
        FV = evaluate(f, V)
        better = FV < F[idx]
        X[idx[better]], F[idx[better]] = V[better], FV[better]
        trials[idx[better]] = 0
        np.add.at(trials, idx[~better], 1)

    neighbour_moves(np.arange(n))                                   # employed bees
    quality = 1 / (1 + F - F.min())
    neighbour_moves(rng.choice(n, size=n, p=quality / quality.sum()))  # onlookers
    worn = np.flatnonzero(trials > limit)                           # scouts
    if len(worn):
        X[worn] = rng.random((len(worn), d))
        F[worn] = evaluate(f, X[worn])
        trials[worn] = 0
    return X, F


def bco(f, dim, pop_size, iters, rng, limit=10, on_iter=None):
    trials = np.zeros(pop_size, dtype=int)
    return run(lambda f, X, F, t, T, rng: _bco_step(f, X, F, t, T, rng, trials, limit), f, dim, pop_size, iters, rng,
               on_iter, "BCO")


def _poa_step(f, X, F, t, T, rng):
    """Pelican Optimization Algorithm (Trojovsky & Dehghani, Sensors, 2022)."""
    n, d = X.shape
    prey = rng.random(d)
    I = rng.integers(1, 3, size=(n, 1))
    r = rng.random((n, d))
    closer = (f(prey) < F)[:, None]
    # Phase 1: move toward the prey if it is better, otherwise away from it.
    X, F = greedy(f, X, F, X + r * ((prey - I * X) * closer + (X - prey) * ~closer))
    # Phase 2: winging on the water surface, a shrinking local search.
    return greedy(f, X, F, X + 0.2 * (1 - t / T) * (2 * rng.random((n, d)) - 1) * X)


def poa(f, dim, pop_size, iters, rng, on_iter=None):
    return run(_poa_step, f, dim, pop_size, iters, rng, on_iter, "POA")
