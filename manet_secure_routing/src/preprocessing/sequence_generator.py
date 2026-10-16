"""Turn flat flow records into sequences for the recurrent models.

Each record's F features are read as a length-F sequence with one channel, (N, F) -> (N, F, 1),
so the multi-scale convolutions and dilated LSTM scan across correlated feature groups.
Records are treated independently, so a random train/test split stays leakage-free.
"""
import torch
from torch.utils.data import DataLoader, TensorDataset


def to_sequences(X):
    return torch.as_tensor(X, dtype=torch.float32).unsqueeze(-1)


def make_loader(X, y, batch_size, shuffle):
    ds = TensorDataset(to_sequences(X), torch.as_tensor(y, dtype=torch.long))
    return DataLoader(ds, batch_size=batch_size, shuffle=shuffle)
