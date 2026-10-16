"""Start Mesh Sentinel (API + built UI) on http://localhost:8000.

    python run.py                 # this machine only
    python run.py --host 0.0.0.0  # also reachable from other machines on the network
"""
import argparse
import sys
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    print(f"Mesh Sentinel on http://{'localhost' if args.host == '127.0.0.1' else args.host}:{args.port}")
    uvicorn.run("manet_secure_routing.server.app:app", host=args.host, port=args.port, log_level="warning")
