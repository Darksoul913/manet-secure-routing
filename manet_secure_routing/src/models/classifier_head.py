import torch
from torch import nn


class ClassifierHead(nn.Module):
    """Last-step + mean pooling over time, then a small MLP to class logits."""

    def __init__(self, hidden, n_classes=2, dropout=0.3):
        super().__init__()
        self.net = nn.Sequential(nn.Dropout(dropout), nn.Linear(2 * hidden, hidden), nn.ReLU(), nn.Linear(hidden, n_classes))

    def forward(self, h):
        return self.net(torch.cat([h[:, -1], h.mean(dim=1)], dim=-1))
