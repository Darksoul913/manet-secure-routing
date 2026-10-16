# Multi-Objective Secure Multicast Routing in MANET using MD-LSTM and HCDSO

Implementation of **"A Multi-Objective Secure Multicast Routing Architecture Using Multi-Scale Dilated LSTM and Hybrid Coati–Dolphin Optimization in MANET Environments"**.

```
MANET traffic -> MD-LSTM IDS -> isolate flagged nodes -> HCDSO multicast tree on safe subgraph -> packets
```

## Layout

```
config/            md_lstm.yaml (IDS), hcdso.yaml (network/optimiser), experiment.yaml (sweeps)
datasets/raw/      cicids2017/*.csv, nsl_kdd/KDDTrain+.txt + KDDTest+.txt, kdd99/kddcup.data_10_percent.gz
src/preprocessing  clean (inf/NaN/dupes/constant cols), label-encode, log+min-max scale, (N,F)->(N,F,1) sequences
src/models         MultiScaleConv (k=3,5,7) -> DilatedLSTM (d=1,2,4, gated residual) -> head; DNN/LSTM baselines
src/training       Adam + early stopping, metrics (acc/prec/rec/F1/FPR/FNR)
src/routing        unit-disk topology, priority-biased Dijkstra decoding to a multicast tree, validator
src/optimization   COA, DSO, HCDSO (credit-based COA/DSO switching + stall trigger), BCO & POA baselines, fitness
src/simulation     Gauss-Markov mobility, first-order radio energy, blackhole/grayhole attackers, packet Monte-Carlo
src/integration    IDS-based node isolation, secure router, closed-loop epoch simulation
experiments/       exp_dataset{1,2,3}.py, routing_exp.py, scalability_exp.py
server/            FastAPI: recorded results, live simulation WebSocket, experiment launcher; export_demo.py
frontend/          Mesh Sentinel UI (React + TypeScript + Vite)
results/           figures/, tables/, models/ (checkpoints + held-out flows), logs/
tests/             test_components.py
```

## Running

From the folder that contains `manet_secure_routing/`:

```bash
pip install -r manet_secure_routing/requirements.txt
PYTHONPATH=. python3 manet_secure_routing/tests/test_components.py
PYTHONPATH=. python3 manet_secure_routing/experiments/exp_dataset1.py   # CICIDS2017 (~2.5 min on Apple MPS)
PYTHONPATH=. python3 manet_secure_routing/experiments/exp_dataset2.py   # NSL-KDD   (~1 min)
PYTHONPATH=. python3 manet_secure_routing/experiments/exp_dataset3.py   # KDD99     (~1 min)
PYTHONPATH=. python3 manet_secure_routing/experiments/routing_exp.py    # needs exp_dataset2 checkpoint (~1 min)
PYTHONPATH=. python3 manet_secure_routing/experiments/scalability_exp.py  # (~2.5 min)
```

### Mesh Sentinel UI

```bash
pip install fastapi uvicorn
cd manet_secure_routing/frontend && npm install && npm run build && cd ../..
PYTHONPATH=. uvicorn manet_secure_routing.server.app:app --port 8000     # open http://localhost:8000
```

For UI development, run `npm run dev` in `frontend/` as well and open http://localhost:5173 (it proxies `/api` and
`/ws` to port 8000). If the server is not reachable, the UI switches to a labelled **recorded demo** that replays
`frontend/public/demo/bundle.json`. That bundle is captured from the real server with
`PYTHONPATH=. python3 manet_secure_routing/server/export_demo.py`; re-run it after new experiments.

- **Command Center:** the live closed loop, one 100 ms epoch at a time: MD-LSTM scores → isolation → optimizer
  iterations (real top-3 candidate trees, COA/DSO phase) → validated tree → packet delivery. It has an inspector, an
  event stream and a replay scrubber.
- **Mesh Simulator:** rebuilds the live network with any node count, area, range, attacker share, IDS
  checkpoint, mobility, packet rate, optimizer and seed.
- **Threat Intelligence:** recorded IDS tables, confusion matrices, and node-level detection in the running session.
- **Routing Arena:** the recorded routing comparison, live convergence runs of all five optimizers on one
  snapshot, and the scalability sweeps.
- **Experiments:** runs the scripts above, streams their logs and keeps a run history (`results/runs.json`).
- **Results Studio:** table explorer with CSV export, proposed-versus-baseline deltas, and the matplotlib figures.

Dataset sources: CICIDS2017 MachineLearningCSV (Kaggle `chethuhn/network-intrusion-dataset`), NSL-KDD
(`github.com/jmnwong/NSL-KDD-Dataset`), KDD99 10% (sklearn's figshare mirror, `ndownloader.figshare.com/files/5976042`).

## Design notes

- **Binary IDS.** Label = attack vs benign. Each dataset is de-duplicated and split 70/15/15 stratified at random;
  CICIDS2017 is capped at 300k stratified rows. NSL-KDD Train+ and Test+ are merged before splitting. The official
  KDDTest+ split contains unseen attack types, and models usually score ~80% on it.
- **IDS in the loop.** Every node emits 20 flows per 100 ms epoch, drawn from the *held-out* test split (attackers
  emit attack flows). A node whose mean MD-LSTM attack probability is ≥ 0.5 is cut from the topology, and the rest
  get trust = 1 − probability, which the route fitness uses.
- **Chromosome = per-node priority in [0,1]** that scales the cost of relaying through that node by 0.5–1.5×, and
  one Dijkstra decodes it to a tree. (A greedy-DFS priority decoder was tried first and produced poor trees
  that no optimiser could repair in 40 iterations.)
- **Fitness** = 0.2·energy + 0.2·delay + 0.2·hops + 0.4·(1 − reliability) (normalised), plus a penalty for
  unreachable destinations.
- **Fair comparison.** Same population (30), iterations (40) and roughly 2–2.5 fitness evaluations per individual per
  iteration for every optimiser. Each optimiser sees the identical node movement, attackers and IDS traffic for a seed.
- **Network.** 50 nodes, 800×800 m, 250 m range, 15% attackers (blackhole / grayhole), 1 source → 5 destinations,
  200 pkt/s of 512 B, results averaged over 3 seeds.

## Results (measured, this repo)

**IDS accuracy (test split)**

| Model | CICIDS2017 | NSL-KDD | KDD99 |
|---|---|---|---|
| SVM (linear) | 98.18% | 93.95% | 99.14% |
| DNN | **99.73%** | 99.14% | **99.81%** |
| LSTM | 98.79% | 96.55% | 98.55% |
| MD-LSTM | 99.71% | **99.19%** | 99.74% |

MD-LSTM beats SVM and LSTM everywhere and roughly ties the DNN (within ±0.07 pp). Inside the simulation it
isolated 100% of attackers with no false isolations.

**Routing (mean over 100–1000 ms, 3 seeds)**

| Algorithm | Throughput (kbps) | PDR | Energy (J) | Delay (ms) | Hops |
|---|---|---|---|---|---|
| BCO | **3264** | **0.797** | 7.108 | 17.51 | 3.69 |
| POA | 3143 | 0.767 | 6.862 | **15.89** | 3.43 |
| COA | 3176 | 0.775 | 6.841 | 16.15 | **3.42** |
| DSO | 3194 | 0.780 | 6.849 | 16.51 | 3.49 |
| HCDSO | 3202 | 0.782 | **6.827** | 16.49 | 3.46 |

HCDSO has the lowest energy use, and it beats BCO by 4–6% on energy, delay and hops. Against POA, COA and DSO it
is within ±4% on every metric, and it is behind BCO on throughput/PDR by ~2%. Full table:
`results/tables/routing_hcdso_improvement_pct.csv`.

**Scalability.** Best fitness and its spread across seeds stay flat from population 10 to 100 and from 10 to 100
nodes for all optimisers. HCDSO's runtime is ~0.4–0.7 s per optimisation, between COA and DSO. See
`results/figures/scalability_*.png`.

> The paper reports gains of 14–18% for HCDSO. This implementation does **not** reproduce gains of that size.
> With a reasonable decoder the routing problem is easy enough that all five swarms converge to similar trees.
