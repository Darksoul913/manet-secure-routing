import torch
import torch.nn.functional as F
from torch import nn


class DilatedLSTMLayer(nn.Module):
    """LSTM whose recurrence skips `dilation` steps (Chang et al., Dilated RNN, 2017).

    Time step t = j*d + r is routed to sub-sequence r at position j, so the d sub-sequences run
    as one batch through an ordinary LSTM. A learned sigmoid gate then mixes the recurrent output
    with a residual projection of the input (the "dilation recurrent gate").
    """

    def __init__(self, in_dim, hidden, dilation):
        super().__init__()
        self.d = dilation
        self.lstm = nn.LSTM(in_dim, hidden, batch_first=True)
        self.proj = nn.Linear(in_dim, hidden) if in_dim != hidden else nn.Identity()
        self.gate = nn.Linear(in_dim + hidden, hidden)

    def forward(self, x):
        B, T, _ = x.shape
        d = self.d
        z = F.pad(x, (0, 0, 0, (-T) % d))
        Tp = z.shape[1]
        z = z.reshape(B, Tp // d, d, -1).transpose(1, 2).reshape(B * d, Tp // d, -1)
        h, _ = self.lstm(z)
        h = h.reshape(B, d, Tp // d, -1).transpose(1, 2).reshape(B, Tp, -1)[:, :T]
        g = torch.sigmoid(self.gate(torch.cat([x, h], dim=-1)))
        return g * h + (1 - g) * self.proj(x)


class DilatedLSTM(nn.Module):
    """Stack of dilated layers, e.g. dilations (1, 2, 4) for exponentially growing memory."""

    def __init__(self, in_dim, hidden, dilations=(1, 2, 4)):
        super().__init__()
        dims = [in_dim] + [hidden] * len(dilations)
        self.layers = nn.ModuleList(DilatedLSTMLayer(dims[i], hidden, d) for i, d in enumerate(dilations))

    def forward(self, x):
        for layer in self.layers:
            x = layer(x)
        return x
