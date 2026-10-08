"""Teste de ponta a ponta local, sem câmera e sem enviar falas à Alexa."""
from io import BytesIO
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".runtime" / "ultralytics"))

from PIL import Image, ImageDraw, ImageFont
from app.config import Settings
from app.vision import RecognitionEngine


def main():
    image = Image.new("RGB", (1280, 720), "white")
    draw = ImageDraw.Draw(image)
    font_path = next((path for path in [Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")] if path.is_file()), None)
    font = ImageFont.truetype(str(font_path), 64) if font_path else ImageFont.load_default(size=64)
    draw.text((85, 180), "LEITURA EM TEMPO REAL", font=font, fill="black")
    draw.text((85, 300), "Teste de leitura 123", font=font, fill="black")
    sample_dir = ROOT / "examples"
    sample_dir.mkdir(exist_ok=True)
    image.save(sample_dir / "teste-leitura.png")
    buffer = BytesIO()
    image.save(buffer, "PNG")
    settings = Settings.from_env()
    engine = RecognitionEngine(model_path=settings.model_path, tesseract_cmd=settings.tesseract_cmd,
                               languages=settings.languages)
    results = {}
    for mode in ("ocr", "yolo_ocr"):
        result = engine.recognize(buffer.getvalue(), mode)
        print(json.dumps({"mode": mode, "text": result["text"], "elapsed_ms": result["elapsed_ms"],
                          "regions": len(result["regions"]), "warnings": result["warnings"]}, ensure_ascii=False))
        assert "LEITURA" in result["text"].upper(), f"Texto principal não reconhecido em {mode}"
        assert "123" in result["text"], f"Números não reconhecidos em {mode}"
        results[mode] = result
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    (artifacts / "smoke-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Reconhecimento real validado nos dois modos.")


if __name__ == "__main__":
    main()
