"""Inicializador local: python run.py [--port 8000]."""
import argparse
import os
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


def open_home_when_ready(port: int) -> None:
    """Open this app's home only after the new server answers locally."""
    url = f"http://localhost:{port}/?v=home"
    for _ in range(80):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1) as response:
                if b"Os limites das m" in response.read(4096):
                    webbrowser.open_new_tab(url)
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.25)


def main():
    parser = argparse.ArgumentParser(description="Lume: leitor visual pela webcam")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--open", action="store_true", help="Abre a página inicial quando o servidor estiver pronto")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    os.chdir(root)
    os.environ.setdefault("YOLO_CONFIG_DIR", str(root / ".runtime" / "ultralytics"))
    import uvicorn
    print(f"\nLume disponível em http://localhost:{args.port}\nCtrl+C para encerrar.\n")
    if args.open:
        threading.Thread(target=open_home_when_ready, args=(args.port,), daemon=True).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
