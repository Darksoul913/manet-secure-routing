"""Monte-Carlo packet delivery over a multicast tree, against the network's ground truth.

Packets travel parent -> children. A relay forwards one broadcast per packet (energy for its
farthest child); each child receives with the link's delivery probability at the *current*
positions (links broken by mobility deliver nothing), and a malicious relay silently drops
packets with its drop probability. Per-hop delay = transmission time + exponential queueing
that grows with the relay's neighbour count.
"""
import numpy as np

from manet_secure_routing.src.routing.multicast import children_of, depth_of
from manet_secure_routing.src.simulation.energy_model import rx_energy, tx_energy


def transmit(parent, order, destinations, D, quality, degree, drop_prob, n_packets, traffic, rng):
    bits = traffic["packet_bits"]
    tx_time = bits / traffic["bitrate"]
    kids = children_of(parent, order)
    source = order[0]
    reached = {source: np.ones(n_packets, dtype=bool)}
    delay = {source: np.zeros(n_packets)}
    energy = 0.0
    node_energy = np.zeros(len(parent))
    links = []  # (u, child, packets forwarded by u, packets received by child)

    for u in order:
        if u not in kids:
            continue
        fwd = reached[u] & (rng.random(n_packets) >= drop_prob[u])
        n_fwd = fwd.sum()
        e_tx, e_rx = n_fwd * tx_energy(bits, D[u, kids[u]].max()), n_fwd * rx_energy(bits)
        energy += e_tx + len(kids[u]) * e_rx
        node_energy[u] += e_tx
        hop = tx_time + rng.exponential(traffic["contention"] * degree[u] * tx_time + 1e-12, n_packets)
        for c in kids[u]:
            reached[c] = fwd & (rng.random(n_packets) < quality[u, c])
            delay[c] = delay[u] + hop
            node_energy[c] += e_rx
            links.append((int(u), int(c), int(n_fwd), int(reached[c].sum())))

    depth = depth_of(parent, order)
    in_tree = [d for d in destinations if parent[d] != -1]
    return {
        "sent": n_packets * len(destinations),
        "delivered": int(sum(reached[d].sum() for d in in_tree)),
        "delay_sum": float(sum(delay[d][reached[d]].sum() for d in in_tree)),
        "energy": float(energy),
        "hops_sum": int(sum(depth[d] for d in in_tree)),
        "routes": len(in_tree),
        "links": links,
        "node_energy": node_energy,
    }
