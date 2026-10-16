"""Dolphin Swarm Optimization (after Wu, Xu & Wang, PLoS ONE, 2016).

Four phases per iteration:
  search    - each dolphin emits sounds in random directions and records the best spot heard (L_i)
  call      - dolphins broadcast L_i; sound travels at finite speed, so dolphin i only hears
  reception   dolphins within the distance sound covers in one step, and keeps the best as K_i
  predation - each dolphin closes in on K_i, the encircling radius shrinking over time
"""
import numpy as np

from manet_secure_routing.src.optimization.population import clip, evaluate, greedy, run

N_SOUNDS = 2
SPEED = 0.1      # sound step length in the unit box
ACCEL = 5.0      # how far a call travels per iteration, in multiples of SPEED


def dso_step(f, X, F, t, T, rng):
    n, d = X.shape

    # Search phase.
    V = rng.normal(size=(n, N_SOUNDS, d))
    V *= SPEED * np.sqrt(d) * (1 - 0.9 * t / T) / np.linalg.norm(V, axis=-1, keepdims=True)
    S = clip(X[:, None] + V)
    FS = evaluate(f, S.reshape(-1, d)).reshape(n, N_SOUNDS)
    j = FS.argmin(1)
    L, FL = S[np.arange(n), j], FS[np.arange(n), j]
    found = FL < F
    X, F = X.copy(), F.copy()
    X[found], F[found] = L[found], FL[found]   # X_i now holds L_i, the best spot dolphin i knows

    # Call + reception phases: best L_j among dolphins whose call reaches i this iteration.
    dist = np.linalg.norm(X[:, None] - X[None], axis=-1)
    heard = dist <= ACCEL * SPEED * np.sqrt(d)
    K = X[np.where(heard, F[None, :], np.inf).argmin(1)]

    # Predation phase: move to a point at a shrinking radius around K_i, on the side of the dolphin.
    to_me = X - K
    dk = np.linalg.norm(to_me, axis=1, keepdims=True)
    unit = np.where(dk > 0, to_me / np.maximum(dk, 1e-12), rng.normal(size=(n, d)) / np.sqrt(d))
    radius = dk * (1 - t / T) * rng.random((n, 1)) + 1e-3
    return greedy(f, X, F, K + unit * radius)


def dso(f, dim, pop_size, iters, rng, on_iter=None):
    return run(dso_step, f, dim, pop_size, iters, rng, on_iter, "DSO")
