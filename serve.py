#!/usr/bin/env python3
"""Dev server for Apocalypse Run: like `python3 -m http.server`, but it tells
the browser never to cache, so a reload always picks up the latest scripts.

Plain http.server sends no cache headers, so browsers may keep using an old
copy of a module (e.g. js/logic/run.js) after it changes. A new game.js then
imports something the stale module doesn't have, and the game fails to start.

Standard library only; works offline. Serves the folder this file is in.

    python3 serve.py              # http://localhost:8000
    python3 serve.py 8080         # another port
    python3 serve.py --lan        # also reachable from other devices on your network
"""

import argparse
import functools
import http.server
import os


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # Make sure ES modules get a JavaScript MIME type on every platform.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve Apocalypse Run with caching disabled.")
    parser.add_argument("port", nargs="?", type=int, default=8000)
    parser.add_argument("--lan", action="store_true", help="listen on all interfaces, not just localhost")
    args = parser.parse_args()

    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    host = "" if args.lan else "127.0.0.1"
    with http.server.ThreadingHTTPServer((host, args.port), handler) as httpd:
        print(f"Apocalypse Run: http://localhost:{args.port}  (caching off; Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
