"""Training loop shared by MD-LSTM and the neural baselines."""
import copy

import torch
from torch import nn


def get_device():
    return torch.device("mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu")


def _run_epoch(model, loader, loss_fn, device, opt=None):
    model.train(opt is not None)
    total_loss = correct = n = 0
    with torch.set_grad_enabled(opt is not None):
        for xb, yb in loader:
            xb, yb = xb.to(device), yb.to(device)
            logits = model(xb)
            loss = loss_fn(logits, yb)
            if opt:
                opt.zero_grad()
                loss.backward()
                opt.step()
            total_loss += loss.item() * len(yb)
            correct += (logits.argmax(1) == yb).sum().item()
            n += len(yb)
    return total_loss / n, correct / n


def train(model, train_loader, val_loader, device, epochs, lr, patience, log=None):
    """Adam + cross-entropy with early stopping; restores the best-validation weights. Returns per-epoch history."""
    model.to(device)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()
    best_loss, best_state, bad, history = float("inf"), None, 0, []
    for epoch in range(1, epochs + 1):
        tr_loss, tr_acc = _run_epoch(model, train_loader, loss_fn, device, opt)
        va_loss, va_acc = _run_epoch(model, val_loader, loss_fn, device)
        history.append({"epoch": epoch, "train_loss": tr_loss, "train_acc": tr_acc, "val_loss": va_loss, "val_acc": va_acc})
        if log:
            log.info(f"epoch {epoch:2d}  train {tr_loss:.4f}/{tr_acc:.4f}  val {va_loss:.4f}/{va_acc:.4f}")
        if va_loss < best_loss:
            best_loss, best_state, bad = va_loss, copy.deepcopy(model.state_dict()), 0
        else:
            bad += 1
            if bad >= patience:
                break
    model.load_state_dict(best_state)
    return history
