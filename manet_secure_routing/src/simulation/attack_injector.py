import numpy as np


def inject_attacks(state, fraction, drop_probs, protected, rng):
    """Turn a random `fraction` of unprotected nodes into blackhole/grayhole attackers."""
    candidates = np.setdiff1d(np.arange(state.n), protected)
    bad = rng.choice(candidates, size=int(round(fraction * state.n)), replace=False)
    kinds = rng.choice(list(drop_probs), size=len(bad))
    state.malicious[bad] = True
    state.drop_prob[bad] = [drop_probs[k] for k in kinds]
    return dict(zip(bad.tolist(), kinds.tolist()))


def sample_flows(state, X, y, k, rng):
    """Each node emits k traffic records: attackers draw from attack flows, the rest from benign ones.

    X, y are a held-out IDS test split, so the IDS never saw these flows in training.
    Returns (N, k, F).
    """
    benign, attack = X[y == 0], X[y == 1]
    flows = np.empty((state.n, k, X.shape[1]), dtype=X.dtype)
    for i in range(state.n):
        pool = attack if state.malicious[i] else benign
        flows[i] = pool[rng.integers(len(pool), size=k)]
    return flows
