"""Comparison IDS models. The SVM baseline is sklearn's LinearSVC, used directly in the experiment."""
from torch import nn


class DNN(nn.Module):
    def __init__(self, n_features, hidden=128, dropout=0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Flatten(),
            nn.Linear(n_features, hidden), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(hidden, hidden // 2), nn.ReLU(),
            nn.Linear(hidden // 2, 2),
        )

    def forward(self, x):
        return self.net(x)


class LSTMBaseline(nn.Module):
    def __init__(self, in_channels=1, hidden=64):
        super().__init__()
        self.lstm = nn.LSTM(in_channels, hidden, batch_first=True)
        self.out = nn.Linear(hidden, 2)

    def forward(self, x):
        _, (h, _) = self.lstm(x)
        return self.out(h[-1])
