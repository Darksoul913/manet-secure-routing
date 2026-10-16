"""Fetch the raw datasets into datasets/raw/ (only needed to re-run the IDS experiments).

    python manet_secure_routing/datasets/download.py

NSL-KDD and KDD99 download directly. CICIDS2017 comes from Kaggle and needs the `kaggle` CLI with an API
token in ~/.kaggle/kaggle.json (https://www.kaggle.com/settings -> Create New Token).
"""
import shutil
import subprocess
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent / "raw"
FILES = {
    "nsl_kdd/KDDTrain+.txt": "https://raw.githubusercontent.com/jmnwong/NSL-KDD-Dataset/master/KDDTrain%2B.txt",
    "nsl_kdd/KDDTest+.txt": "https://raw.githubusercontent.com/jmnwong/NSL-KDD-Dataset/master/KDDTest%2B.txt",
    "kdd99/kddcup.data_10_percent.gz": "https://ndownloader.figshare.com/files/5976042",  # sklearn's mirror
}
CICIDS_KAGGLE = "chethuhn/network-intrusion-dataset"


def main():
    for rel, url in FILES.items():
        dest = RAW / rel
        if dest.exists():
            print(f"ok      {rel} (already present)")
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"fetch   {rel}")
        urllib.request.urlretrieve(url, dest)

    cic = RAW / "cicids2017"
    if any(cic.glob("*.csv")):
        print("ok      cicids2017 (already present)")
    elif shutil.which("kaggle"):
        print("fetch   cicids2017 from Kaggle (~230 MB zipped)")
        cic.mkdir(parents=True, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", CICIDS_KAGGLE, "-p", str(cic), "--unzip"], check=True)
    else:
        print(f"skip    cicids2017: install the Kaggle CLI (pip install kaggle), add your API token, then re-run.\n"
              f"        Or download https://www.kaggle.com/datasets/{CICIDS_KAGGLE} and unzip the CSVs into {cic}")


if __name__ == "__main__":
    main()
