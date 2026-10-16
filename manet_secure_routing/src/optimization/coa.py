"""Coati Optimization Algorithm (Dehghani et al., Knowledge-Based Systems, 2023)."""
from manet_secure_routing.src.optimization.population import evaluate, greedy, run


def coa_step(f, X, F, t, T, rng):
    n, d = X.shape
    half = n // 2
    iguana = X[F.argmin()]

    # Phase 1 (exploration): half the coatis climb toward the iguana (best solution) ...
    I = rng.integers(1, 3, size=(n, 1))
    X_new = X.copy()
    X_new[:half] = X[:half] + rng.random((half, d)) * (iguana - I[:half] * X[:half])
    # ... the other half chase it after it falls to a random spot on the ground.
    ground = rng.random((n - half, d))
    F_ground = evaluate(f, ground)
    rest, r = X[half:], rng.random((n - half, d))
    closer = (F_ground < F[half:])[:, None]
    X_new[half:] = rest + r * ((ground - I[half:] * rest) * closer + (rest - ground) * ~closer)
    X, F = greedy(f, X, F, X_new)

    # Phase 2 (exploitation): escape from predators inside a neighbourhood that shrinks as 1/t.
    lb, ub = 0.0 / t, 1.0 / t
    r = rng.random((n, d))
    X_new = X + (1 - 2 * r) * (lb + rng.random((n, d)) * (ub - lb))
    return greedy(f, X, F, X_new)


def coa(f, dim, pop_size, iters, rng, on_iter=None):
    return run(coa_step, f, dim, pop_size, iters, rng, on_iter, "COA")
