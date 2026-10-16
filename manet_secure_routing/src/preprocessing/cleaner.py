"""Load raw IDS datasets into one DataFrame with a binary `label` column (1 = attack)."""
import numpy as np
import pandas as pd

KDD_COLUMNS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes", "land",
    "wrong_fragment", "urgent", "hot", "num_failed_logins", "logged_in", "num_compromised",
    "root_shell", "su_attempted", "num_root", "num_file_creations", "num_shells",
    "num_access_files", "num_outbound_cmds", "is_host_login", "is_guest_login", "count",
    "srv_count", "serror_rate", "srv_serror_rate", "rerror_rate", "srv_rerror_rate",
    "same_srv_rate", "diff_srv_rate", "srv_diff_host_rate", "dst_host_count",
    "dst_host_srv_count", "dst_host_same_srv_rate", "dst_host_diff_srv_rate",
    "dst_host_same_src_port_rate", "dst_host_srv_diff_host_rate", "dst_host_serror_rate",
    "dst_host_srv_serror_rate", "dst_host_rerror_rate", "dst_host_srv_rerror_rate", "label",
]


def load_nsl_kdd(raw_dir):
    # Train+ and Test+ are merged and re-split later, like the other two datasets.
    files = [raw_dir / "nsl_kdd" / f for f in ("KDDTrain+.txt", "KDDTest+.txt")]
    df = pd.concat([pd.read_csv(f, header=None, names=KDD_COLUMNS + ["difficulty"]) for f in files],
                   ignore_index=True).drop(columns="difficulty")
    df["label"] = (df["label"] != "normal").astype(int)
    return df


def load_kdd99(raw_dir):
    df = pd.read_csv(raw_dir / "kdd99" / "kddcup.data_10_percent.gz", header=None, names=KDD_COLUMNS)
    df["label"] = (df["label"] != "normal.").astype(int)
    return df


def load_cicids2017(raw_dir):
    files = sorted((raw_dir / "cicids2017").glob("*.csv"))
    df = pd.concat([pd.read_csv(f, low_memory=False) for f in files], ignore_index=True)
    df.columns = df.columns.str.strip()
    df["label"] = (df.pop("Label").str.strip() != "BENIGN").astype(int)
    return df


LOADERS = {"cicids2017": load_cicids2017, "nsl_kdd": load_nsl_kdd, "kdd99": load_kdd99}


def clean(df):
    """Drop inf/NaN rows, duplicate rows and constant columns."""
    df = df.replace([np.inf, -np.inf], np.nan).dropna().drop_duplicates()
    constant = [c for c in df.columns if c != "label" and df[c].nunique() <= 1]
    return df.drop(columns=constant).reset_index(drop=True)


def subsample(df, n, seed):
    """Stratified cap of `n` rows (no-op when n is None or the frame is already smaller)."""
    if n is None or len(df) <= n:
        return df
    frac = n / len(df)
    return df.groupby("label").sample(frac=frac, random_state=seed).reset_index(drop=True)
