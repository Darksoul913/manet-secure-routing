"""Capture a recorded-demo bundle for the UI from the real server code (no synthetic data).

    PYTHONPATH=. python3 manet_secure_routing/server/export_demo.py [epochs]

Writes frontend/public/demo/bundle.json: the recorded result tables, one arena run, and a live
simulation session of `epochs` epochs exactly as the WebSocket would have streamed it.
"""
import asyncio
import json
import sys
import time

from manet_secure_routing.server import app as server

OUT = server.ROOT / "frontend" / "public" / "demo" / "bundle.json"


def main(epochs=30):
    session = server.LiveSession({})
    init = session.init_payload()
    steps = [session.step() for _ in range(epochs)]
    bundle = {
        "captured": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "note": "Captured from manet_secure_routing/server with export_demo.py",
        "health": server.health(),
        "defaults": server.defaults(),
        "config": server.config(),
        "ids": server.ids_results(),
        "routing": server.routing_results(),
        "scalability": server.scalability_results(),
        "arena": asyncio.run(server.convergence(seed=1, pop_size=30, iters=40)),
        "files": server.list_files(),
        "session": {"init": init, "epochs": steps},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(server.clean(bundle), separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB, {epochs} epochs)")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 30)
