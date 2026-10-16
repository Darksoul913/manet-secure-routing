"""Closed loop per routing epoch:

    traffic -> MD-LSTM IDS -> isolate flagged nodes -> optimise multicast tree on the safe subgraph
            -> nodes move for one epoch -> packets delivered over the tree at the new positions
"""
import numpy as np

from manet_secure_routing.src.integration.attack_mitigation import isolate
from manet_secure_routing.src.integration.secure_router import find_route
from manet_secure_routing.src.simulation.manet_environment import MANETEnvironment
from manet_secure_routing.src.simulation.packet_flow import transmit
from manet_secure_routing.src.training.evaluate_md_lstm import predict_proba

COUNTED = ("sent", "delivered", "delay_sum", "energy", "hops_sum", "routes")


def run_epochs(cfg, optimizer, ids_model, flow_pool, device, seed, on_iter=None):
    """Yield (env, detail) once per routing epoch, forever. Callers decide when to stop.

    The environment and the optimiser get separate RNG streams, so every optimiser faces the
    exact same node movement, attackers and IDS traffic for a given seed.
    """
    env = MANETEnvironment(cfg, np.random.default_rng(seed), flow_pool)
    opt_rng, pkt_rng = np.random.default_rng(seed + 1000), np.random.default_rng(seed + 2000)
    traffic, ids_cfg = cfg["traffic"], cfg["ids"]
    epoch_s = traffic["epoch_ms"] / 1000
    n_packets = int(round(traffic["packet_rate"] * epoch_s))
    group = [env.source, *env.destinations]
    yield env, None   # initial state, before the first epoch

    while True:
        pos_start = env.state.pos.copy()
        flows = env.flows(ids_cfg["flows_per_node"])
        n, k, f = flows.shape
        flow_probs = predict_proba(ids_model, flows.reshape(n * k, f), device).reshape(n, k)
        scores = flow_probs.mean(1)   # same as node_attack_scores, kept per flow for inspection
        blocked = isolate(scores, ids_cfg["threshold"], group)
        trust = np.where(blocked, 0.0, 1 - scores)

        D, A, quality, _ = env.links(blocked)
        parent, order, objectives, best_f, problems = find_route(
            optimizer, D, A, quality, trust, blocked, env.source, env.destinations, cfg, opt_rng, on_iter)

        env.step(epoch_s)
        D, A_end, quality, degree = env.links()
        stats = transmit(parent, order, env.destinations, D, quality, degree, env.state.drop_prob, n_packets, traffic, pkt_rng)
        yield env, dict(pos_start=pos_start, flow_probs=flow_probs, scores=scores, blocked=blocked, A=A,
                        parent=parent, order=order, objectives=objectives, fitness=best_f, problems=problems,
                        A_end=A_end, stats=stats)


def simulate(cfg, optimizer, ids_model, flow_pool, device, sim_time_ms, seed):
    """Run one optimiser for sim_time_ms. Returns cumulative metrics after every epoch."""
    traffic = cfg["traffic"]
    totals = dict.fromkeys(COUNTED, 0) | dict(tp=0, fp=0, fn=0)
    history = []
    epochs = run_epochs(cfg, optimizer, ids_model, flow_pool, device, seed)
    env, _ = next(epochs)
    for epoch in range(1, sim_time_ms // traffic["epoch_ms"] + 1):
        env, d = next(epochs)
        history.append(accumulate(totals, d, env.state.malicious, epoch, traffic))
    return history


def accumulate(totals, d, malicious, epoch, traffic):
    """Add one epoch to running totals; return the cumulative metrics at this point."""
    for k in COUNTED:
        totals[k] += d["stats"][k]
    blocked = d["blocked"]
    totals["tp"] += int((blocked & malicious).sum())
    totals["fp"] += int((blocked & ~malicious).sum())
    totals["fn"] += int((~blocked & malicious).sum())
    t_s = epoch * traffic["epoch_ms"] / 1000
    return {
        "time_ms": epoch * traffic["epoch_ms"],
        "throughput_kbps": totals["delivered"] * traffic["packet_bits"] / t_s / 1000,
        "pdr": totals["delivered"] / totals["sent"],
        "energy_j": totals["energy"],
        "delay_ms": 1000 * totals["delay_sum"] / max(totals["delivered"], 1),
        "hop_count": totals["hops_sum"] / max(totals["routes"], 1),
        "detection_rate": totals["tp"] / max(totals["tp"] + totals["fn"], 1),
        "false_isolations": totals["fp"],
    }
