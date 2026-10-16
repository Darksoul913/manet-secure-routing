from functools import partial

from manet_secure_routing.src.optimization.baselines import bco, poa
from manet_secure_routing.src.optimization.coa import coa
from manet_secure_routing.src.optimization.dso import dso
from manet_secure_routing.src.optimization.fitness import RouteFitness
from manet_secure_routing.src.optimization.hcdso import hcdso
from manet_secure_routing.src.routing.route_validator import validate_tree


def algorithms(stall_limit):
    return {"BCO": bco, "POA": poa, "COA": coa, "DSO": dso, "HCDSO": partial(hcdso, stall_limit=stall_limit)}


def find_route(optimizer, D, A, quality, trust, blocked, source, destinations, cfg, rng, on_iter=None):
    """Optimise a multicast tree on the safe subgraph. Returns (parent, order, objectives, fitness, problems).

    on_iter(t, X, F, phase, fitness) is forwarded from the optimiser for live inspection.
    """
    fit = RouteFitness(D, A, quality, trust, source, destinations, cfg["traffic"], cfg["fitness"], cfg["network"]["radio_range"])
    oc = cfg["optimizer"]
    hook = (lambda t, X, F, phase: on_iter(t, X, F, phase, fit)) if on_iter else None
    best_x, best_f, _ = optimizer(fit, A.shape[0], oc["pop_size"], oc["iters"], rng, on_iter=hook)
    parent, order, n_unreachable = fit.decode(best_x)
    problems = validate_tree(parent, source, destinations, A, blocked)
    assert not [p for p in problems if "unreachable" not in p], problems   # decoding only walks real, unblocked links
    return parent, order, fit.objectives(parent, order, n_unreachable), best_f, problems
