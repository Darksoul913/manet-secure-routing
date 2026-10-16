import numpy as np
from sklearn.preprocessing import MinMaxScaler


def _signed_log(x):
    # Flow features (bytes/s, IAT) span ~10 orders of magnitude; compress before min-max.
    return np.sign(x) * np.log1p(np.abs(x))


def scale(X_train, *others):
    """Fit log + min-max on the training split only, apply to every split, return float32 arrays."""
    scaler = MinMaxScaler().fit(_signed_log(X_train))
    return [np.clip(scaler.transform(_signed_log(X)), 0, 1).astype(np.float32) for X in (X_train, *others)]
