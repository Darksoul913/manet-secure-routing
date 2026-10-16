from torch import nn

from manet_secure_routing.src.models.classifier_head import ClassifierHead
from manet_secure_routing.src.models.dilated_lstm import DilatedLSTM
from manet_secure_routing.src.models.multiscale_conv import MultiScaleConv


class MDLSTM(nn.Module):
    """Multi-scale Dilated LSTM: MultiScaleConv -> DilatedLSTM -> ClassifierHead.

    Input (B, T, C) sequences, output (B, 2) logits (benign, attack).
    """

    def __init__(self, in_channels=1, conv_channels=16, kernels=(3, 5, 7), hidden=64, dilations=(1, 2, 4), dropout=0.3):
        super().__init__()
        self.conv = MultiScaleConv(in_channels, conv_channels, kernels)
        self.rnn = DilatedLSTM(self.conv.out_channels, hidden, dilations)
        self.head = ClassifierHead(hidden, dropout=dropout)

    def forward(self, x):
        return self.head(self.rnn(self.conv(x)))
