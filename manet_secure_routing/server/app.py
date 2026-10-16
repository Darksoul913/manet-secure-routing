"""Mesh Sentinel API: recorded results, on-demand optimiser runs, experiment launcher, live simulation.

Run from the folder containing manet_secure_routing/:
    PYTHONPATH=. uvicorn manet_secure_routing.server.app:app --port 8000
"""
import asyncio
import copy
import hashlib
import json
import os
import subprocess
import sys
import time
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from manet_secure_routing.src.integration.attack_mitigation import load_ids
from manet_secure_routing.src.integration.framework import accumulate, COUNTED, run_epochs
from manet_secure_routing.src.integration.secure_router import algorithms
from manet_secure_routing.src.optimization.fitness import RouteFitness
from manet_secure_routing.src.routing.topology import adjacency, distance_matrix
from manet_secure_routing.src.simulation.manet_environment import MANETEnvironment
from manet_secure_routing.src.training.train_md_lstm import get_device

ROOT = Path(__file__).resolve().parents[1]
RESULTS, CONFIG = ROOT / "results", ROOT / "config"
DATASETS = {"cicids2017": "CICIDS2017", "nsl_kdd": "NSL-KDD", "kdd99": "KDD99"}
ALGORITHMS = ["HCDSO", "DSO", "COA", "POA", "BCO"]
DEVICE = get_device()

app = FastAPI(title="Mesh Sentinel")


def load_cfg(name):
    return yaml.safe_load(open(CONFIG / f"{name}.yaml"))


def config_sha():
    h = hashlib.sha256()
    for p in sorted(CONFIG.glob("*.yaml")):
        h.update(p.read_bytes())
    return h.hexdigest()[:12]


def mtime(p):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(p.stat().st_mtime)) if p.exists() else None


def clean(o):
    """numpy -> JSON-safe python, floats rounded for transport."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.bool_, bool)):
        return bool(o)
    if isinstance(o, (np.integer, int)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else round(float(o), 6)
    return o


@lru_cache(maxsize=3)
def ids_bundle(dataset):
    ckpt = RESULTS / "models" / f"md_lstm_{dataset}.pt"
    pool = RESULTS / "models" / f"{dataset}_test.npz"
    if not ckpt.exists() or not pool.exists():
        raise HTTPException(409, f"No trained IDS for {dataset}. Run the {DATASETS[dataset]} experiment first.")
    data = np.load(pool)
    return load_ids(ckpt, DEVICE), (data["X"], data["y"])


# ---------------------------------------------------------------- recorded results

@app.get("/api/health")
def health():
    exp = load_cfg("experiment")
    return {"ok": True, "device": str(DEVICE), "ids_dataset": exp["ids_dataset"], "config_sha": config_sha(),
            "checkpoints": {d: (RESULTS / "models" / f"md_lstm_{d}.pt").exists() for d in DATASETS}}


@app.get("/api/config")
def config():
    return {name: {"values": load_cfg(name), "text": (CONFIG / f"{name}.yaml").read_text()}
            for name in ("md_lstm", "hcdso", "experiment")} | {"sha": config_sha()}


@app.get("/api/results/ids")
def ids_results():
    out = {}
    for ds, label in DATASETS.items():
        table = RESULTS / "tables" / f"ids_{ds}.csv"
        pool = RESULTS / "models" / f"{ds}_test.npz"
        if not table.exists():
            continue
        df = pd.read_csv(table)
        entry = {"label": label, "models": clean(df.to_dict("records")), "recorded": mtime(table)}
        if pool.exists():
            y = np.load(pool)["y"]
            P, N = int(y.sum()), int(len(y) - y.sum())
            entry["test"] = {"rows": int(len(y)), "attacks": P, "benign": N}
            # Exact counts recovered from the recorded rates and the known class sizes of the test split.
            entry["confusion"] = {r["model"]: {"tp": P - round(r["fnr"] * P), "fn": round(r["fnr"] * P),
                                               "fp": round(r["fpr"] * N), "tn": N - round(r["fpr"] * N)}
                                  for r in df.to_dict("records")}
        out[ds] = entry
    return out


@app.get("/api/results/routing")
def routing_results():
    raw_p = RESULTS / "tables" / "routing_raw.csv"
    if not raw_p.exists():
        raise HTTPException(404, "No routing results yet. Run the routing experiment.")
    raw = pd.read_csv(raw_p)
    metrics = ["throughput_kbps", "pdr", "energy_j", "delay_ms", "hop_count", "detection_rate", "false_isolations"]
    g = raw.groupby(["algorithm", "time_ms"])[metrics]
    mean, std = g.mean().reset_index(), g.std().reset_index()
    imp = pd.read_csv(RESULTS / "tables" / "routing_hcdso_improvement_pct.csv")
    return {"mean": clean(mean.to_dict("records")), "std": clean(std.to_dict("records")),
            "improvement": clean(imp.to_dict("records")), "seeds": sorted(raw.seed.unique().tolist()),
            "recorded": mtime(raw_p), "ids_dataset": load_cfg("experiment")["ids_dataset"]}


@app.get("/api/results/scalability")
def scalability_results():
    p = RESULTS / "tables" / "scalability_summary.csv"
    if not p.exists():
        raise HTTPException(404, "No scalability results yet. Run the scalability experiment.")
    return {"rows": clean(pd.read_csv(p).to_dict("records")), "recorded": mtime(p)}


@app.get("/api/files/{kind}/{name}")
def files(kind: str, name: str):
    if kind not in ("tables", "figures") or name not in os.listdir(RESULTS / kind):
        raise HTTPException(404, "No such file")
    return FileResponse(RESULTS / kind / name, filename=name)


@app.get("/api/files")
def list_files():
    return {k: sorted(os.listdir(RESULTS / k)) for k in ("tables", "figures") if (RESULTS / k).exists()}


# ---------------------------------------------------------------- optimiser arena

def tree_edges(parent, order):
    return [[int(parent[v]), int(v)] for v in order[1:]]


def adjacency_edges(A):
    iu = np.argwhere(np.triu(A, 1))
    return iu.tolist()


@app.get("/api/arena/convergence")
async def convergence(seed: int = 1, pop_size: int = 30, iters: int = 40):
    """Run every optimiser once on the same network snapshot (attackers isolated from ground truth)."""
    if not (1 <= pop_size <= 100 and 5 <= iters <= 100):
        raise HTTPException(422, "pop_size must be 1-100 and iters 5-100")
    cfg = load_cfg("hcdso")
    env = MANETEnvironment(cfg, np.random.default_rng(seed))
    blocked = env.state.malicious
    D, A, q, _ = env.links(blocked)
    fit = RouteFitness(D, A, q, np.where(blocked, 0.0, 1.0), env.source, env.destinations,
                       cfg["traffic"], cfg["fitness"], cfg["network"]["radio_range"])
    algos = algorithms(cfg["optimizer"]["stall_limit"])

    def run_all():
        runs = {}
        for name in ALGORITHMS:
            phases = []
            t0 = time.time()
            x, best, curve = algos[name](fit, len(A), pop_size, iters, np.random.default_rng(seed),
                                         on_iter=lambda t, X, F, ph: phases.append(ph))
            parent, order, n_un = fit.decode(x)
            runs[name] = {"curve": curve, "best": best, "phases": phases, "runtime_s": time.time() - t0,
                          "objectives": fit.objectives(parent, order, n_un), "edges": tree_edges(parent, order)}
        return runs

    runs = await asyncio.to_thread(run_all)
    return clean({"seed": seed, "pop_size": pop_size, "iters": iters, "area": cfg["network"]["area"],
                  "positions": env.state.pos, "edges": adjacency_edges(A), "blocked": np.flatnonzero(blocked),
                  "source": env.source, "destinations": env.destinations, "runs": runs})


# ---------------------------------------------------------------- experiment launcher

SCRIPTS = {
    "exp_dataset1": {"title": "IDS on CICIDS2017", "outputs": ["ids_cicids2017.csv", "md_lstm_cicids2017.pt"], "minutes": 3},
    "exp_dataset2": {"title": "IDS on NSL-KDD", "outputs": ["ids_nsl_kdd.csv", "md_lstm_nsl_kdd.pt"], "minutes": 1},
    "exp_dataset3": {"title": "IDS on KDD99", "outputs": ["ids_kdd99.csv", "md_lstm_kdd99.pt"], "minutes": 1},
    "routing_exp": {"title": "Routing comparison, 100-1000 ms", "outputs": ["routing_mean.csv", "routing_raw.csv"], "minutes": 1},
    "scalability_exp": {"title": "Population and chromosome sweeps", "outputs": ["scalability_summary.csv"], "minutes": 3},
    "test_components": {"title": "Component tests", "outputs": [], "minutes": 0.2},
}
RUNS_FILE = RESULTS / "runs.json"
PROCS = {}


def read_runs():
    try:
        return json.loads(RUNS_FILE.read_text())
    except (OSError, ValueError):
        return []


def refresh_runs():
    runs = read_runs()
    changed = False
    for r in runs:
        if r["status"] != "running":
            continue
        proc = PROCS.get(r["id"])
        code = proc.poll() if proc else -1   # no handle -> server restarted while it ran
        if code is not None:
            r.update(status="succeeded" if code == 0 else "failed", returncode=code,
                     finished=time.strftime("%Y-%m-%dT%H:%M:%S"), duration_s=round(time.time() - r["t0"], 1))
            changed = True
    if changed:
        RUNS_FILE.write_text(json.dumps(runs, indent=1))
    return runs


@app.get("/api/experiments")
def experiments():
    return {"scripts": SCRIPTS, "runs": list(reversed(refresh_runs()))}


@app.post("/api/experiments/{name}/run")
def run_experiment(name: str):
    if name not in SCRIPTS:
        raise HTTPException(404, "Unknown experiment")
    runs = refresh_runs()
    if any(r["status"] == "running" for r in runs):
        raise HTTPException(409, "Another experiment is still running. Wait for it to finish.")
    run_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{name}"
    folder = "tests" if name == "test_components" else "experiments"
    log = RESULTS / "logs" / f"run_{run_id}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ | {"PYTHONPATH": str(ROOT.parent), "PYTHONUNBUFFERED": "1"}
    PROCS[run_id] = subprocess.Popen([sys.executable, str(ROOT / folder / f"{name}.py")], cwd=ROOT.parent, env=env,
                                     stdout=open(log, "w"), stderr=subprocess.STDOUT)
    runs.append({"id": run_id, "script": name, "status": "running", "started": time.strftime("%Y-%m-%dT%H:%M:%S"),
                 "t0": time.time(), "config_sha": config_sha(), "python": sys.version.split()[0],
                 "device": str(DEVICE), "log": log.name})
    RUNS_FILE.write_text(json.dumps(runs, indent=1))
    if name.startswith("exp_dataset") or name == "routing_exp":
        ids_bundle.cache_clear()
    return runs[-1]


@app.get("/api/experiments/runs/{run_id}/log")
def run_log(run_id: str, tail: int = 200):
    run = next((r for r in read_runs() if r["id"] == run_id), None)
    if not run:
        raise HTTPException(404, "Unknown run")
    lines = (RESULTS / "logs" / run["log"]).read_text(errors="replace").splitlines()
    return {"lines": lines[-tail:], "total": len(lines)}


# ---------------------------------------------------------------- live simulation

LIMITS = {  # param: (min, max, cfg path)
    "n_nodes": (10, 150, ("network", "n_nodes")),
    "area": (300, 2000, ("network", "area")),
    "radio_range": (100, 400, ("network", "radio_range")),
    "n_destinations": (1, 10, ("network", "n_destinations")),
    "malicious_fraction": (0.0, 0.4, ("network", "malicious_fraction")),
    "mean_speed": (0.0, 30.0, ("mobility", "mean_speed")),
    "packet_rate": (20, 1000, ("traffic", "packet_rate")),
    "pop_size": (5, 100, ("optimizer", "pop_size")),
    "iters": (5, 100, ("optimizer", "iters")),
    "threshold": (0.1, 0.9, ("ids", "threshold")),
}


def sim_defaults():
    cfg = load_cfg("hcdso")
    return {k: cfg[a][b] for k, (_, _, (a, b)) in LIMITS.items()} | {
        "seed": 7, "algorithm": "HCDSO", "ids_dataset": load_cfg("experiment")["ids_dataset"]}


@app.get("/api/sim/defaults")
def defaults():
    return {"params": sim_defaults(), "limits": {k: v[:2] for k, v in LIMITS.items()}, "algorithms": ALGORITHMS,
            "ids_datasets": {d: DATASETS[d] for d in DATASETS if (RESULTS / "models" / f"md_lstm_{d}.pt").exists()}}


def build_cfg(params):
    cfg = load_cfg("hcdso")
    for k, (lo, hi, (a, b)) in LIMITS.items():
        if k in params:
            v = min(max(params[k], lo), hi)
            cfg[a][b] = int(round(v)) if isinstance(lo, int) else float(v)
    n = cfg["network"]["n_nodes"]
    cfg["network"]["n_destinations"] = min(cfg["network"]["n_destinations"], max(1, n // 4))
    return cfg


class LiveSession:
    def __init__(self, params):
        p = sim_defaults() | {k: v for k, v in params.items() if v is not None}
        if p["algorithm"] not in ALGORITHMS:
            raise ValueError(f"Unknown algorithm {p['algorithm']}")
        if p["ids_dataset"] not in DATASETS:
            raise ValueError(f"Unknown IDS dataset {p['ids_dataset']}")
        self.params = p
        self.cfg = build_cfg(p)
        self.dataset = p["ids_dataset"]
        model, pool = ids_bundle(self.dataset)
        self.iterations = []
        algo = algorithms(self.cfg["optimizer"]["stall_limit"])[p["algorithm"]]
        self.gen = run_epochs(self.cfg, algo, model, pool, DEVICE, int(p["seed"]), on_iter=self._record)
        self.env, _ = next(self.gen)
        self.epoch, self.prev_route = 0, []
        self.totals = dict.fromkeys(COUNTED, 0) | dict(tp=0, fp=0, fn=0)
        for k in ("energy", "delay_sum"):
            self.totals[k] = 0.0

    def _record(self, t, X, F, phase, fit):
        rank = np.argsort(F)
        seen, cands = set(), []
        for i in rank:   # up to three distinct candidate trees from the current population
            parent, order, _ = fit.decode(X[i])
            edges = tree_edges(parent, order)
            key = tuple(map(tuple, edges))
            if key not in seen:
                seen.add(key)
                cands.append({"edges": edges, "fitness": F[i]})
            if len(cands) == 3:
                break
        self.iterations.append({"t": t, "phase": phase, "best": F.min(), "mean": F.mean(), "candidates": cands})

    def init_payload(self):
        s, net = self.env.state, self.cfg["network"]
        D = distance_matrix(s.pos)
        return clean({"type": "init", "params": self.params, "ids_dataset": self.dataset,
                      "area": net["area"], "radio_range": net["radio_range"], "epoch_ms": self.cfg["traffic"]["epoch_ms"],
                      "threshold": self.cfg["ids"]["threshold"], "positions": s.pos,
                      "edges": adjacency_edges(adjacency(D, net["radio_range"])),
                      "source": self.env.source, "destinations": self.env.destinations,
                      "truth": {"malicious": np.flatnonzero(s.malicious), "attackers": self.env.attackers}})

    def step(self):
        self.iterations = []
        env, d = next(self.gen)
        self.epoch += 1
        s, net = env.state, self.cfg["network"]
        full_start = adjacency(distance_matrix(d["pos_start"]), net["radio_range"])
        blocked = d["blocked"]
        removed = [e for e in adjacency_edges(full_start) if blocked[e[0]] or blocked[e[1]]]
        invalid = [e for e in self.prev_route if not d["A"][e[0], e[1]]]
        route = tree_edges(d["parent"], d["order"])
        self.prev_route = route
        cumulative = accumulate(self.totals, d, s.malicious, self.epoch, self.cfg["traffic"])
        st = d["stats"]
        thr = self.cfg["ids"]["threshold"]
        return clean({
            "type": "epoch", "epoch": self.epoch, "time_ms": self.epoch * self.cfg["traffic"]["epoch_ms"],
            "pos_start": d["pos_start"], "pos_end": s.pos, "speed": s.speed,
            "detect": {"scores": d["scores"], "flow_probs": np.round(d["flow_probs"], 3),
                       "flagged": np.flatnonzero(d["scores"] >= thr),
                       "suspicious": np.flatnonzero((d["scores"] >= 0.3) & (d["scores"] < thr))},
            "isolate": {"blocked": np.flatnonzero(blocked), "removed_edges": removed, "invalidated": invalid},
            "edges_safe": adjacency_edges(d["A"]), "edges_end": adjacency_edges(d["A_end"]),
            "optimize": {"algorithm": self.params["algorithm"], "iterations": self.iterations, "fitness": d["fitness"]},
            "route": {"edges": route, "objectives": d["objectives"], "problems": d["problems"],
                      "valid": not [p for p in d["problems"] if "unreachable" not in p]},
            "deliver": {"links": st["links"], "sent": st["sent"], "delivered": st["delivered"], "energy": st["energy"],
                        "delay_ms": 1000 * st["delay_sum"] / max(st["delivered"], 1), "node_energy": st["node_energy"]},
            "cumulative": cumulative,
        })


@app.websocket("/ws/sim")
async def sim_socket(ws: WebSocket):
    await ws.accept()
    session = None
    try:
        while True:
            msg = await ws.receive_json()
            try:
                if msg.get("type") == "reset":
                    session = await asyncio.to_thread(LiveSession, msg.get("params", {}))
                    await ws.send_json(session.init_payload())
                elif msg.get("type") == "step":
                    if session is None:
                        await ws.send_json({"type": "error", "message": "Reset the simulation before stepping."})
                        continue
                    await ws.send_json(await asyncio.to_thread(session.step))
            except (HTTPException, ValueError) as e:
                await ws.send_json({"type": "error", "message": getattr(e, "detail", None) or str(e)})
    except WebSocketDisconnect:
        pass


# ---------------------------------------------------------------- built UI (npm run build) on the same port

DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        inside = DIST.resolve() in f.parents
        return FileResponse(f if inside and f.is_file() else DIST / "index.html")
