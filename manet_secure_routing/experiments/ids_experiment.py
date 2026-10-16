"""Shared IDS pipeline behind exp_dataset1/2/3: preprocess, train MD-LSTM + SVM/DNN/LSTM, save results."""
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml
from sklearn.model_selection import train_test_split
from sklearn.svm import LinearSVC

from manet_secure_routing.src.models.baselines import DNN, LSTMBaseline
from manet_secure_routing.src.models.md_lstm import MDLSTM
from manet_secure_routing.src.preprocessing.cleaner import LOADERS, clean, subsample
from manet_secure_routing.src.preprocessing.encoder import encode_categorical
from manet_secure_routing.src.preprocessing.scaler import scale
from manet_secure_routing.src.preprocessing.sequence_generator import make_loader
from manet_secure_routing.src.training.evaluate_md_lstm import evaluate
from manet_secure_routing.src.training.metrics import binary_metrics
from manet_secure_routing.src.training.train_md_lstm import get_device, train
from manet_secure_routing.src.utils.logger import get_logger
from manet_secure_routing.src.utils.seed import seed_everything
from manet_secure_routing.src.utils.visualization import plot_histories, plot_metric_bars

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"


def run(dataset):
    cfg = yaml.safe_load(open(ROOT / "config" / "md_lstm.yaml"))
    seed = cfg["seed"]
    seed_everything(seed)
    log = get_logger(f"ids.{dataset}")

    t0 = time.time()
    df = clean(LOADERS[dataset](ROOT / "datasets" / "raw"))
    df = encode_categorical(subsample(df, cfg["max_samples"].get(dataset), seed))
    y = df.pop("label").to_numpy()
    X = df.to_numpy(np.float64)
    log.info(f"{len(X)} rows x {X.shape[1]} features, attack share {y.mean():.3f} ({time.time() - t0:.0f}s)")

    held_out = cfg["split"]["val"] + cfg["split"]["test"]
    X_tr, X_tmp, y_tr, y_tmp = train_test_split(X, y, test_size=held_out, stratify=y, random_state=seed)
    X_va, X_te, y_va, y_te = train_test_split(X_tmp, y_tmp, test_size=cfg["split"]["test"] / held_out,
                                              stratify=y_tmp, random_state=seed)
    X_tr, X_va, X_te = scale(X_tr, X_va, X_te)

    results, histories = {}, {}
    t0 = time.time()
    svm = LinearSVC().fit(X_tr, y_tr)
    results["SVM"] = binary_metrics(y_te, svm.predict(X_te)) | {"train_s": time.time() - t0}
    log.info(f"SVM {results['SVM']}")

    device = get_device()
    n_features, bs, tcfg, bcfg = X_tr.shape[1], cfg["training"]["batch_size"], cfg["training"], cfg["baselines"]
    models = {
        "DNN": DNN(n_features, bcfg["dnn_hidden"]),
        "LSTM": LSTMBaseline(hidden=bcfg["lstm_hidden"]),
        "MD-LSTM": MDLSTM(**cfg["model"]),
    }
    train_loader, val_loader = make_loader(X_tr, y_tr, bs, True), make_loader(X_va, y_va, bs, False)
    for name, model in models.items():
        log.info(f"training {name} on {device}")
        t0 = time.time()
        histories[name] = train(model, train_loader, val_loader, device, tcfg["epochs"], tcfg["lr"], tcfg["patience"], log)
        results[name] = evaluate(model, X_te, y_te, device) | {"train_s": time.time() - t0}
        log.info(f"{name} {results[name]}")

    table = pd.DataFrame(results).T
    table.index.name = "model"
    for sub in ("tables", "figures", "models"):
        (RESULTS / sub).mkdir(parents=True, exist_ok=True)
    table.to_csv(RESULTS / "tables" / f"ids_{dataset}.csv", float_format="%.5f")
    plot_metric_bars(table, ["accuracy", "precision", "recall", "f1"], f"IDS comparison ({dataset})",
                     RESULTS / "figures" / f"ids_{dataset}_metrics.png")
    plot_metric_bars(table, ["fpr", "fnr"], f"Error rates ({dataset})", RESULTS / "figures" / f"ids_{dataset}_errors.png")
    plot_histories(histories, "val_acc", f"Validation accuracy ({dataset})", RESULTS / "figures" / f"ids_{dataset}_val_acc.png")

    # Checkpoint + held-out flows: the MANET simulation uses these as its IDS and its traffic pool.
    torch.save({"state_dict": models["MD-LSTM"].state_dict(), "kwargs": cfg["model"]},
               RESULTS / "models" / f"md_lstm_{dataset}.pt")
    np.savez_compressed(RESULTS / "models" / f"{dataset}_test.npz", X=X_te, y=y_te)
    print(table.round(4).to_string())
    return table
