#!/usr/bin/env python
"""Standalone camera connectivity check for on-site setup.

Runs independently of the FastAPI app so an installer can validate a camera
(Intelbras IP camera or DVR/NVR channel) before wiring it into the edge
service. Prints resolution, measured FPS and clear diagnostics for the most
common failure modes (wrong credentials, wrong channel, unreachable host).

Usage examples:

    # Using CAMERA_SOURCE / RTSP_URL from .env
    python scripts/test_camera_connection.py

    # Explicit RTSP URL
    python scripts/test_camera_connection.py --url rtsp://user:pass@192.168.0.10:554/cam/realmonitor?channel=1&subtype=0

    # Intelbras host + credentials (builds the URL for you)
    python scripts/test_camera_connection.py --intelbras-host 192.168.0.10 \\
        --intelbras-user admin --intelbras-password secret --channel 1
"""

import argparse
import os
import sys
import time

EDGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if EDGE_DIR not in sys.path:
    sys.path.insert(0, EDGE_DIR)

from src.config import Settings, resolve_camera_source  # noqa: E402
from src.vision.camera import CameraCapture, sanitize_error  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", help="RTSP/HTTP URL or webcam index; overrides .env")
    parser.add_argument("--intelbras-host", help="Camera/DVR/NVR IP address")
    parser.add_argument("--intelbras-user", default="admin")
    parser.add_argument("--intelbras-password", default="")
    parser.add_argument("--port", type=int, default=554)
    parser.add_argument("--channel", type=int, default=1)
    parser.add_argument(
        "--subtype", type=int, default=0, help="0=mainstream, 1=substream"
    )
    parser.add_argument(
        "--duration", type=float, default=10.0, help="Seconds to read frames for"
    )
    return parser.parse_args()


def resolve_source(args: argparse.Namespace) -> str | int:
    if args.url:
        return resolve_camera_source(args.url, "")
    if args.intelbras_host:
        return resolve_camera_source(
            "",
            "",
            intelbras_host=args.intelbras_host,
            intelbras_user=args.intelbras_user,
            intelbras_password=args.intelbras_password,
            intelbras_port=args.port,
            intelbras_channel=args.channel,
            intelbras_subtype=args.subtype,
        )
    settings = Settings()
    return settings.RESOLVED_CAMERA_SOURCE


def main() -> int:
    args = parse_args()
    source = resolve_source(args)
    display_source = sanitize_error(str(source))
    print(f"Testando fonte de camera: {display_source}")

    camera = CameraCapture(source=source, reconnect_seconds=999999)
    if not camera.open():
        print(f"FALHA ao abrir a camera: {camera.last_error}")
        print(
            "Verifique: IP acessivel (ping/telnet na porta), usuario/senha, "
            "numero do canal (para DVR/NVR) e se o RTSP esta habilitado no "
            "cadastro da camera."
        )
        return 1

    print("Camera aberta com sucesso. Lendo frames...")
    frame_count = 0
    started = time.monotonic()
    resolution_printed = False
    while time.monotonic() - started < args.duration:
        frame = camera.read()
        if frame is None:
            print(f"Aviso: leitura falhou ({camera.last_error})")
            continue
        frame_count += 1
        if not resolution_printed:
            height, width = frame.shape[:2]
            print(f"Resolucao: {width}x{height}")
            resolution_printed = True

    elapsed = time.monotonic() - started
    fps = frame_count / elapsed if elapsed > 0 else 0.0
    camera.close()

    print(f"Frames lidos: {frame_count} em {elapsed:.1f}s (~{fps:.1f} FPS)")
    if frame_count == 0:
        print("FALHA: nenhum frame foi lido. A conexao abre mas o stream nao entrega video.")
        return 1

    print("OK: conexao validada.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
