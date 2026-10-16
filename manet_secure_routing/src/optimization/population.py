"""Shared swarm plumbing. Every optimiser works on the unit box [0, 1]^dim and minimises f.

An optimiser is a `step(f, X, F, t, T, rng) -> (X, F)` function that returns the updated
population and fitness; `run` drives any step function and records the convergence curve.
"""
import numpy as np


def init_population(pop_size, dim, rng):
    return rng.random((pop_size, dim))


def evaluate(f, X):
    return np.array([f(x) for x in X])


def clip(X):
    return np.clip(X, 0.0, 1.0)


def greedy(f, X, F, X_new):
    """Evaluate candidates and keep each one only where it improves on the current member."""
    X_new = clip(X_new)
    F_new = evaluate(f, X_new)
    better = F_new < F
    X[better], F[better] = X_new[better], F_new[better]
    return X, F


def run(step, f, dim, pop_size, iters, rng, on_iter=None, label=None):
    """Returns (best_x, best_f, curve) where curve[t] is the best fitness after iteration t.

    on_iter(t, X, F, label) is called after every iteration (used by the live UI); it must not touch rng.
    """
    X = init_population(pop_size, dim, rng)
    F = evaluate(f, X)
    curve = []
    for t in range(1, iters + 1):
        X, F = step(f, X, F, t, iters, rng)
        curve.append(F.min())
        if on_iter:
            on_iter(t, X, F, label)
    i = F.argmin()
    return X[i].copy(), F[i], np.array(curve)
