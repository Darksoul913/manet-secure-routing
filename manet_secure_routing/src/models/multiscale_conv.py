import torch
from torch import nn


class MultiScaleConv(nn.Module):
    """Parallel 1-D convolutions with different kernel sizes, concatenated on the channel axis.

    (B, T, C_in) -> (B, T, channels * len(kernels))
    """

    def __init__(self, in_channels, channels, kernels=(3, 5, 7)):
        super().__init__()
        self.branches = nn.ModuleList(
            nn.Sequential(nn.Conv1d(in_channels, channels, k, padding=k // 2), nn.BatchNorm1d(channels), nn.ReLU())
            for k in kernels
        )
        self.out_channels = channels * len(kernels)

    def forward(self, x):
        x = x.transpose(1, 2)
        return torch.cat([b(x) for b in self.branches], dim=1).transpose(1, 2)
