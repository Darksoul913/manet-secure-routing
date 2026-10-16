# MANET Secure Multicast Routing: MD-LSTM + HCDSO

Computer Networks course project. It implements an MD-LSTM intrusion detector, attack isolation, and HCDSO
(hybrid coati–dolphin) multicast routing in a simulated mobile ad hoc network. **Mesh Sentinel** is its
interactive UI.

## Quick start

You need Python 3.10 or newer. Node is not required: the UI is already built in `manet_secure_routing/frontend/dist`.

```bash
git clone https://github.com/Darksoul913/manet-secure-routing.git
cd manet-secure-routing
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r manet_secure_routing/requirements.txt
python run.py
```

Open http://localhost:8000. Trained IDS checkpoints and recorded results are included, so every screen works
immediately: the live simulation, Threat Intelligence, Routing Arena and Results Studio. To share it with someone
on the same Wi-Fi, run `python run.py --host 0.0.0.0` and give them `http://<your-ip>:8000`.

The live simulation runs on Apple Silicon (MPS), CUDA or plain CPU, whichever is available.

## Re-running the experiments

Only needed to retrain or regenerate results; the raw datasets are not in the repo (about 870 MB).

```bash
python manet_secure_routing/datasets/download.py         # NSL-KDD + KDD99; CICIDS2017 needs a Kaggle token
PYTHONPATH=. python manet_secure_routing/tests/test_components.py
PYTHONPATH=. python manet_secure_routing/experiments/exp_dataset2.py   # or run them from the Experiments page
```

The design, measured results and every experiment command are in
[`manet_secure_routing/README.md`](manet_secure_routing/README.md).

## Changing the UI

```bash
cd manet_secure_routing/frontend && npm install
npm run dev        # http://localhost:5173, proxies to python run.py on :8000
npm run build      # refresh dist/ before committing
```
