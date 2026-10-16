from dataclasses import dataclass

import numpy as np


@dataclass
class NodeState:
    """Per-node state for the whole network, stored as arrays indexed by node id."""

    pos: np.ndarray          # (N, 2) metres
    speed: np.ndarray        # (N,) m/s
    direction: np.ndarray    # (N,) rad
    mean_direction: np.ndarray
    malicious: np.ndarray    # (N,) bool, ground truth
    drop_prob: np.ndarray    # (N,) probability the node drops a packet it should relay

    @property
    def n(self):
        return len(self.pos)
