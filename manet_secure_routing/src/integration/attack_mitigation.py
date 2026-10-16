import numpy as np
import torch

from manet_secure_routing.src.models.md_lstm import MDLSTM


def load_ids(path, device):
    ckpt = torch.load(path, map_location=device)
    model = MDLSTM(**ckpt["kwargs"]).to(device)
    model.load_state_dict(ckpt["state_dict"])
    return model.eval()


def isolate(scores, threshold, protected):
    """Mask of nodes to cut from the topology. Group members are never isolated."""
    blocked = scores >= threshold
    blocked[np.asarray(protected)] = False
    return blocked
