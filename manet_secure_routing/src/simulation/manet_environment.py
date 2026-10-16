import numpy as np

from manet_secure_routing.src.routing.topology import adjacency, distance_matrix, link_quality
from manet_secure_routing.src.simulation.attack_injector import inject_attacks, sample_flows
from manet_secure_routing.src.simulation.mobility import gauss_markov_step
from manet_secure_routing.src.simulation.node import NodeState


class MANETEnvironment:
    """Mobile nodes, one multicast group, and injected attackers, driven by a seeded RNG.

    Mobility and traffic sampling use only `rng`, so two environments built with the same
    seed evolve identically whatever routing decisions are made on top of them.
    """

    def __init__(self, cfg, rng, flow_pool=None):
        net, mob = cfg["network"], cfg["mobility"]
        self.cfg, self.rng, self.flow_pool = cfg, rng, flow_pool
        n, self.area, self.radio_range = net["n_nodes"], net["area"], net["radio_range"]
        theta = rng.uniform(-np.pi, np.pi, n)
        self.state = NodeState(
            pos=rng.uniform(0, self.area, (n, 2)),
            speed=np.full(n, float(mob["mean_speed"])),
            direction=theta,
            mean_direction=theta.copy(),
            malicious=np.zeros(n, dtype=bool),
            drop_prob=np.zeros(n),
        )
        group = rng.choice(n, size=net["n_destinations"] + 1, replace=False)
        self.source, self.destinations = int(group[0]), group[1:].tolist()
        self.attackers = inject_attacks(self.state, net["malicious_fraction"], net["attack_drop_prob"], group, rng)

    def step(self, dt):
        m = self.cfg["mobility"]
        gauss_markov_step(self.state, dt, self.area, m["mean_speed"], m["speed_std"], m["direction_std"], m["alpha"], self.rng)

    def flows(self, k):
        X, y = self.flow_pool
        return sample_flows(self.state, X, y, k, self.rng)

    def links(self, blocked=None):
        """(D, A, quality, degree) at the current positions."""
        D = distance_matrix(self.state.pos)
        A = adjacency(D, self.radio_range, blocked)
        return D, A, link_quality(D, self.radio_range, self.cfg["traffic"]["edge_loss"]), A.sum(1)
