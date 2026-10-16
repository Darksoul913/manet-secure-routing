"""Component checks. Run: PYTHONPATH=. python3 manet_secure_routing/tests/test_components.py"""
from pathlib import Path

import numpy as np
import torch
import yaml

from manet_secure_routing.src.integration.secure_router import algorithms, find_route
from manet_secure_routing.src.models.baselines import DNN, LSTMBaseline
from manet_secure_routing.src.models.dilated_lstm import DilatedLSTMLayer
from manet_secure_routing.src.models.md_lstm import MDLSTM
from manet_secure_routing.src.optimization.fitness import RouteFitness
from manet_secure_routing.src.routing.multicast import build_tree, decode_tree
from manet_secure_routing.src.routing.route_validator import validate_tree
from manet_secure_routing.src.simulation.manet_environment import MANETEnvironment
from manet_secure_routing.src.simulation.packet_flow import transmit
from manet_secure_routing.src.training.metrics import binary_metrics

CFG = yaml.safe_load(open(Path(__file__).resolve().parents[1] / "config" / "hcdso.yaml"))


def test_model_shapes():
    x = torch.rand(8, 41, 1)
    for m in (MDLSTM(), DNN(41), LSTMBaseline()):
        assert m(x).shape == (8, 2)


def test_dilation_routing():
    # With dilation 2 and an identity-free check: steps 0,2,4 and 1,3 must form independent chains.
    layer = DilatedLSTMLayer(1, 4, dilation=2)
    x = torch.zeros(1, 5, 1)
    base = layer(x)
    x[0, 1] = 5.0                       # perturb an odd step
    out = layer(x)
    changed = (out - base).abs().sum(-1)[0] > 1e-6
    assert changed.tolist() == [False, True, False, True, False], changed


def test_metrics():
    m = binary_metrics(np.array([0, 0, 1, 1]), np.array([0, 1, 1, 0]))
    assert m["accuracy"] == 0.5 and m["fpr"] == 0.5 and m["fnr"] == 0.5


def test_priority_decoding():
    # Route 0-1-2-3 (cheap links) vs 0-4-3 (pricier links): priorities decide which tree wins.
    cost = np.zeros((5, 5))
    for a, b, c in [(0, 1, 0.3), (1, 2, 0.3), (2, 3, 0.3), (0, 4, 0.6), (4, 3, 0.6)]:
        cost[a, b] = cost[b, a] = c
    parent, order, n_un = decode_tree(np.array([0, 0, 0, 0, 1.0]), cost, 0, [3])
    assert order == [0, 1, 2, 3] and n_un == 0      # 4 is expensive -> long cheap route
    parent, order, _ = decode_tree(np.array([0, 1, 1, 0, 0.0]), cost, 0, [3])
    assert order == [0, 4, 3]                       # 1, 2 expensive -> shortcut through 4
    assert decode_tree(np.zeros(5), np.zeros((5, 5)), 0, [3])[2] == 1   # no links -> unreachable
    # Merging both paths keeps only the BFS-shortest branch to the destination.
    parent, order = build_tree([[0, 1, 2, 3], [0, 4, 3]], 0, [3], 5)
    assert order == [0, 4, 3] and parent[3] == 4 and parent[1] == parent[2] == -1


def test_decoded_trees_are_valid():
    rng = np.random.default_rng(0)
    env = MANETEnvironment(CFG, rng)
    blocked = env.state.malicious.copy()
    D, A, q, _ = env.links(blocked)
    fit = RouteFitness(D, A, q, np.ones(len(A)), env.source, env.destinations, CFG["traffic"], CFG["fitness"], 250)
    for _ in range(50):
        parent, order, n_un = fit.decode(rng.random(len(A)))
        problems = validate_tree(parent, env.source, env.destinations, A, blocked)
        assert len([p for p in problems if "unreachable" not in p]) == 0, problems
        assert sum("unreachable" in p for p in problems) == n_un


def test_blackhole_drops_everything():
    # Chain 0 -> 1 -> 2 with node 1 a blackhole: nothing reaches 2.
    parent, order = np.array([0, 0, 1]), [0, 1, 2]
    D = np.zeros((3, 3))
    q = np.ones((3, 3))
    stats = transmit(parent, order, [2], D, q, np.ones(3), np.array([0, 1.0, 0]), 100, CFG["traffic"], np.random.default_rng(0))
    assert stats["sent"] == 100 and stats["delivered"] == 0


def test_optimisers_reduce_fitness():
    sphere = lambda x: float(((x - 0.3) ** 2).sum())
    for name, opt in algorithms(5).items():
        _, best, curve = opt(sphere, 10, 20, 30, np.random.default_rng(1))
        assert curve[-1] <= curve[0] and best < 0.1, (name, best)


def test_secure_route_avoids_blocked_nodes():
    rng = np.random.default_rng(3)
    env = MANETEnvironment(CFG, rng)
    blocked = env.state.malicious
    D, A, q, _ = env.links(blocked)
    trust = np.where(blocked, 0.0, 1.0)
    parent, order, obj, _, _ = find_route(algorithms(5)["HCDSO"], D, A, q, trust, blocked, env.source, env.destinations, CFG, rng)
    assert not blocked[order].any()
    assert 0 <= obj["reliability"] <= 1


if __name__ == "__main__":
    tests = [(k, v) for k, v in globals().items() if k.startswith("test_")]
    for name, fn in tests:
        fn()
        print(f"ok  {name}")
    print(f"{len(tests)} passed")
