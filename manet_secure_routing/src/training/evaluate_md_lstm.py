import numpy as np
import torch

from manet_secure_routing.src.preprocessing.sequence_generator import to_sequences
from manet_secure_routing.src.training.metrics import binary_metrics


@torch.no_grad()
def predict_proba(model, X, device, batch_size=4096):
    """Attack probability for each row of a flat (N, F) feature array."""
    model.eval()
    out = [torch.softmax(model(to_sequences(X[i:i + batch_size]).to(device)), dim=1)[:, 1].cpu()
           for i in range(0, len(X), batch_size)]
    return torch.cat(out).numpy() if out else np.empty(0)


def evaluate(model, X, y, device):
    return binary_metrics(y, (predict_proba(model, X, device) >= 0.5).astype(int))
