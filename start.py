#!/usr/bin/env python3
"""Startet den Helferplan über einen lokalen HTTP-Server.

Ein direkter Doppelklick auf `index.html` funktioniert nicht, weil Browser
ES-Module und `crypto.subtle` für `file://`-URLs blockieren. Dieses Skript
liefert das Projekt über HTTP aus und öffnet die Startseite im Browser.
"""

from __future__ import annotations

import argparse
import functools
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import webbrowser

ROOT = Path(__file__).resolve().parent
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765


class DevServerHandler(SimpleHTTPRequestHandler):
    """Liefert die Projektdateien ohne aggressive Browser-Zwischenspeicherung."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


def parse_args() -> argparse.Namespace:
    try:
        default_port = int(os.environ.get("HELFERPLAN_PORT", DEFAULT_PORT))
    except ValueError:
        default_port = DEFAULT_PORT

    parser = argparse.ArgumentParser(
        description="Startet den Helferplan lokal über HTTP und öffnet index.html."
    )
    parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=default_port,
        help=f"Port des lokalen Servers (Standard: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "-H",
        "--host",
        default=DEFAULT_HOST,
        help=f"Bind-Adresse des Servers (Standard: {DEFAULT_HOST})",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="index.html nicht automatisch im Browser öffnen",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not 1 <= args.port <= 65535:
        print("Fehler: Der Port muss zwischen 1 und 65535 liegen.", file=sys.stderr)
        return 1

    handler = functools.partial(DevServerHandler, directory=str(ROOT))
    try:
        server = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as error:
        print(f"Fehler: Der lokale Server konnte nicht gestartet werden: {error}", file=sys.stderr)
        print(
            f"Tipp: Ist Port {args.port} bereits belegt? "
            f"Versuchen Sie es mit: python3 start.py --port {args.port + 1}",
            file=sys.stderr,
        )
        return 1

    browser_host = "127.0.0.1" if args.host in {"0.0.0.0", "::"} else args.host
    url = f"http://{browser_host}:{args.port}/index.html"

    print(f"Helferplan läuft unter {url}", flush=True)
    print("Beenden mit Strg+C.", flush=True)

    if not args.no_browser:
        if not webbrowser.open(url, new=2):
            print(
                "Der Browser konnte nicht automatisch geöffnet werden. "
                "Bitte öffnen Sie die URL manuell.",
                flush=True,
            )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer wird beendet.", flush=True)
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
