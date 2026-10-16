def validate_tree(parent, source, destinations, A, blocked):
    """Return a list of problems with a multicast tree (empty list = valid).

    Checks every destination reaches the source through real links, without cycles and
    without relaying through a blocked (isolated) node.
    """
    problems = []
    for d in destinations:
        v, seen = d, set()
        while v != source:
            if v in seen:
                problems.append(f"cycle on path to {d}")
                break
            seen.add(v)
            u = parent[v]
            if u == -1:
                problems.append(f"destination {d} unreachable")
                break
            if not A[u, v]:
                problems.append(f"edge {u}->{v} is not a link")
            if blocked[u] and u != source:
                problems.append(f"relay {u} is blocked")
            v = u
    return problems
