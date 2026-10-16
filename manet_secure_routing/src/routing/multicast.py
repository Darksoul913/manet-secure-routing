"""Priority-based decoding of a continuous chromosome into a multicast tree.

A chromosome holds one priority in [0, 1] per node. The cost of relaying through node v is its
link base cost scaled by (0.5 + priority[v]), i.e. by 0.5x-1.5x, and one Dijkstra from the source
gives a shortest-path tree to every destination. Any chromosome therefore decodes to a loop-free
tree over real links; the optimiser's job is to bend that tree toward the multi-objective optimum.
"""
from collections import defaultdict

import numpy as np
from scipy.sparse.csgraph import dijkstra


def decode_tree(priority, base_cost, source, destinations):
    """base_cost: (N, N) positive cost per link, 0 = no link. Returns (parent, order, n_unreachable)."""
    W = base_cost * (0.5 + priority)[None, :]
    _, pred = dijkstra(W, directed=True, indices=source, return_predecessors=True)
    paths = []
    for d in destinations:
        if pred[d] < 0:
            continue
        p = [d]
        while p[-1] != source:
            p.append(pred[p[-1]])
        paths.append(p[::-1])
    parent, order = build_tree(paths, source, destinations, len(base_cost))
    return parent, order, len(destinations) - len(paths)


def build_tree(paths, source, destinations, n):
    """Merge paths into a BFS tree from the source, pruned to branches that lead to a destination.

    Returns (parent, order): parent[v] = upstream node (-1 = not in tree, parent[source] = source),
    order = tree nodes in BFS order (parents before children).
    """
    adj = defaultdict(set)
    for p in paths:
        for a, b in zip(p, p[1:]):
            adj[a].add(b)
            adj[b].add(a)
    parent = np.full(n, -1)
    parent[source] = source
    order = [source]
    for u in order:
        for v in sorted(adj[u]):
            if parent[v] == -1:
                parent[v] = u
                order.append(v)

    keep = {source}
    for d in destinations:
        v = d
        while parent[v] != -1 and v not in keep:
            keep.add(v)
            v = parent[v]
    parent[[v for v in order if v not in keep]] = -1
    return parent, [v for v in order if v in keep]


def children_of(parent, order):
    kids = defaultdict(list)
    for v in order[1:]:
        kids[parent[v]].append(v)
    return kids


def depth_of(parent, order):
    depth = np.full(len(parent), -1)
    depth[order[0]] = 0
    for v in order[1:]:
        depth[v] = depth[parent[v]] + 1
    return depth
