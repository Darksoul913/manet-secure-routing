"""Multi-objective route fitness (lower is better).

f = w_e*E/E_ref + w_d*Delay/D_ref + w_h*Hops/H_ref + w_r*(1 - Reliability) + penalty*unreachable_share

Reliability of a destination = product of link qualities along its path times the IDS trust
(1 - attack probability) of every relay, so suspicious-but-not-isolated nodes are avoided too.
"""
import numpy as np

from manet_secure_routing.src.routing.multicast import children_of, decode_tree
from manet_secure_routing.src.simulation.energy_model import rx_energy, tx_energy

H_REF = 10        # hops; normalisers put each objective on a comparable ~0-1 scale
HOP_COST = 0.05   # base link cost per hop, on top of -log(link quality * relay trust)


class RouteFitness:
    def __init__(self, D, A, quality, trust, source, destinations, traffic, fitness_cfg, radio_range):
        self.D, self.quality, self.trust = D, quality, trust
        self.source, self.destinations = source, list(destinations)
        with np.errstate(divide="ignore"):
            self.base_cost = np.where(A, HOP_COST - np.log(quality * np.maximum(trust, 1e-6)[None, :]), 0.0)
        self.bits = traffic["packet_bits"]
        tx_time = self.bits / traffic["bitrate"]
        self.hop_delay = tx_time * (1 + traffic["contention"] * A.sum(1))   # transmission + expected queueing at each node
        self.w = fitness_cfg["weights"]
        self.penalty = fitness_cfg["unreachable_penalty"]
        self.e_ref = len(self.destinations) * H_REF * (tx_energy(self.bits, radio_range) + rx_energy(self.bits)) / 2
        self.d_ref = H_REF * self.hop_delay.mean()

    def objectives(self, parent, order, n_unreachable):
        kids = children_of(parent, order)
        energy = sum(tx_energy(self.bits, self.D[u, c].max()) + len(c) * rx_energy(self.bits) for u, c in kids.items())
        hops, delay, rel = [], [], []
        for d in self.destinations:
            if parent[d] == -1:
                rel.append(0.0)
                continue
            h, dl, r, v = 0, 0.0, 1.0, d
            while v != self.source:
                u = parent[v]
                h, dl, r = h + 1, dl + self.hop_delay[u], r * self.quality[u, v]
                if u != self.source:
                    r *= self.trust[u]
                v = u
            hops.append(h)
            delay.append(dl)
            rel.append(r)
        return {
            "energy": energy,
            "delay": np.mean(delay) if delay else 0.0,
            "hops": np.mean(hops) if hops else 0.0,
            "reliability": float(np.mean(rel)),
            "unreachable": n_unreachable,
        }

    def score(self, o):
        w = self.w
        return (w["energy"] * o["energy"] / self.e_ref + w["delay"] * o["delay"] / self.d_ref
                + w["hops"] * o["hops"] / H_REF + w["reliability"] * (1 - o["reliability"])
                + self.penalty * o["unreachable"] / len(self.destinations))

    def decode(self, x):
        return decode_tree(x, self.base_cost, self.source, self.destinations)

    def __call__(self, x):
        return self.score(self.objectives(*self.decode(x)))
