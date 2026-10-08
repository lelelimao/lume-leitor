"""Download the exact text detector checkpoint, verifying its SHA-256.

Usage: python scripts/download_models.py
Publisher: https://huggingface.co/RoyRud1902/yolo11n-text
The publisher labels the weights Apache-2.0. Ultralytics has its own license.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import sys
import tempfile
from urllib.request import Request, urlopen


MODEL_REPO = "RoyRud1902/yolo11n-text"
MODEL_REVISION = "8fc8436770be72178cf788983b73bf6a75c967e3"
MODEL_SHA256 = "ce26dca363a67fe96c09cc51bed5d09de887239ad5f8a1bd71ee216c2f602a20"
MODEL_SIZE = 5_452_890
MODEL_URL = f"https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/best.pt"
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "models" / "yolo11n-text.pt"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(output: Path) -> Path:
    output = output.resolve()
    if output.is_file() and sha256(output) == MODEL_SHA256:
        print(f"Modelo já verificado: {output}")
        return output
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        request = Request(MODEL_URL, headers={"User-Agent": "Leitor-Vivo/1.0"})
        with urlopen(request, timeout=60) as response:
            with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".part", delete=False) as target:
                temporary = Path(target.name)
                received = 0
                while block := response.read(1024 * 1024):
                    received += len(block)
                    if received > MODEL_SIZE:
                        raise ValueError("O download excedeu o tamanho esperado do modelo.")
                    target.write(block)
        if received != MODEL_SIZE or sha256(temporary) != MODEL_SHA256:
            raise ValueError("SHA-256 ou tamanho inválido. Nenhum modelo foi instalado.")
        temporary.replace(output)
        temporary = None
        print(f"Modelo YOLO de texto verificado e salvo em: {output}")
        print(f"Revisão: {MODEL_REVISION}")
        return output
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Baixar o modelo YOLO11n especializado em texto.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Caminho do arquivo .pt de saída.")
    args = parser.parse_args()
    try:
        download(args.output)
    except (OSError, ValueError) as exc:
        print(f"Não foi possível baixar o modelo: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
