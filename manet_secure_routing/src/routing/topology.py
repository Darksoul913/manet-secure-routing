import numpy as np


def distance_matrix(pos):
    return np.linalg.norm(pos[:, None] - pos[None], axis=-1)


def adjacency(D, radio_range, blocked=None):
    """Unit-disk graph; nodes in the `blocked` mask lose every link (isolated attackers)."""
    A = (D <= radio_range) & ~np.eye(len(D), dtype=bool)
    if blocked is not None:
        A[blocked] = False
        A[:, blocked] = False
    return A


def link_quality(D, radio_range, edge_loss):
    """Per-hop delivery probability: ~1 for close nodes, 1 - edge_loss at the edge of range, 0 beyond."""
    return np.where(D <= radio_range, 1 - edge_loss * (D / radio_range) ** 4, 0.0)
