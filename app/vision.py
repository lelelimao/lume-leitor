"""Local text detection and recognition, loaded only when a frame arrives.

YOLO locates text regions; Tesseract recognizes their letters. Generic COCO
weights do not detect text, so the default checkpoint is a text-specific model.
All returned coordinates refer to the EXIF-corrected image, resized to at most
1600 pixels on its longest side (the returned width/height).
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import math
import os
from pathlib import Path
import shutil
import threading
import time
import warnings


MODEL_REVISION = "8fc8436770be72178cf788983b73bf6a75c967e3"
MODEL_SHA256 = "ce26dca363a67fe96c09cc51bed5d09de887239ad5f8a1bd71ee216c2f602a20"
MODES = {"yolo_ocr", "ocr"}
MAX_IMAGE_PIXELS = 24_000_000
MAX_DIMENSION = 1600
MAX_REGIONS = 40


class EngineUnavailable(RuntimeError):
    """An OCR dependency, model or runtime is unavailable."""


class RecognitionEngine:
    def __init__(
        self,
        mode: str = "yolo_ocr",
        model_path: str = "models/yolo11n-text.pt",
        gpu: bool = False,
        confidence: float = 0.35,
        ocr_confidence: float = 0.30,
        tesseract_cmd: str | None = None,
        languages: str = "por+eng",
    ) -> None:
        if mode not in MODES:
            raise ValueError("Modo inválido. Use yolo_ocr ou ocr.")
        if not 0 <= confidence <= 1 or not 0 <= ocr_confidence <= 1:
            raise ValueError("As confianças devem estar entre 0 e 1.")
        self.mode = mode
        self.model_path = Path(model_path)
        self.gpu = gpu
        self.confidence = confidence
        self.ocr_confidence = ocr_confidence
        self.tesseract_cmd = tesseract_cmd
        self.languages = languages
        self._model = None
        self._ocr = None
        self._active_languages = None
        self._language_warnings: list[str] = []
        self._lock = threading.Lock()

    def _find_tesseract(self) -> str | None:
        if self.tesseract_cmd:
            return shutil.which(self.tesseract_cmd)
        found = shutil.which("tesseract")
        if found:
            return found
        project_root = Path(__file__).resolve().parent.parent
        candidates = [
            project_root / "tools" / "tesseract" / "tesseract.exe",
            project_root / "tools" / "Tesseract-OCR" / "tesseract.exe",
            Path(os.environ.get("ProgramFiles", "C:/Program Files"))
            / "Tesseract-OCR" / "tesseract.exe",
            Path(os.environ.get("LOCALAPPDATA", "~")).expanduser()
            / "Programs" / "Tesseract-OCR" / "tesseract.exe",
        ]
        return next((str(path) for path in candidates if path.is_file()), None)

    def status(self) -> dict:
        """Fast availability check; does not import Torch or initialize YOLO."""
        executable = self._find_tesseract()
        messages = []
        packages = ["PIL", "pytesseract"]
        if self.mode == "yolo_ocr":
            packages.append("ultralytics")
        missing = [package for package in packages if importlib.util.find_spec(package) is None]
        if missing:
            messages.append("Instale as dependências Python: " + ", ".join(missing) + ".")
        if not executable:
            messages.append("Instale o Tesseract e configure TESSERACT_CMD no arquivo .env.")
        model_exists = self.model_path.is_file()
        if self.mode == "yolo_ocr" and not model_exists:
            messages.append("Baixe o detector com: python scripts/download_models.py")
        return {
            "ready": bool(executable and not missing and (self.mode == "ocr" or model_exists)),
            "mode": self.mode,
            "model_exists": model_exists,
            "model_path": str(self.model_path),
            "tesseract_available": bool(executable),
            "tesseract_cmd": executable,
            "languages": self._active_languages or self.languages,
            "loaded": self._ocr is not None and (self.mode == "ocr" or self._model is not None),
            "warnings": messages + self._language_warnings,
        }

    @staticmethod
    def _decode_image(image_bytes: bytes):
        try:
            from PIL import Image, ImageOps, UnidentifiedImageError
        except ImportError as exc:
            raise EngineUnavailable("Instale Pillow com pip install -r requirements.txt.") from exc
        if not isinstance(image_bytes, bytes) or not image_bytes:
            raise ValueError("Envie uma imagem JPEG, PNG ou WebP válida.")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(image_bytes)) as original:
                    if original.format not in {"JPEG", "PNG", "WEBP", "BMP"}:
                        raise ValueError("Formato de imagem não suportado. Use JPEG, PNG, WebP ou BMP.")
                    if original.width * original.height > MAX_IMAGE_PIXELS:
                        raise ValueError("A imagem excede o limite de 24 megapixels.")
                    original.load()
                    image = ImageOps.exif_transpose(original)
                    if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
                        rgba = image.convert("RGBA")
                        background = Image.new("RGBA", rgba.size, "white")
                        image = Image.alpha_composite(background, rgba).convert("RGB")
                    else:
                        image = image.convert("RGB")
                    image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
                    return image.copy()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError,
                Image.DecompressionBombWarning) as exc:
            raise ValueError("Não foi possível abrir a imagem. O arquivo está inválido ou corrompido.") from exc

    def _load_ocr(self) -> None:
        if self._ocr is not None:
            return
        executable = self._find_tesseract()
        if not executable:
            raise EngineUnavailable("Tesseract não encontrado. Instale o programa e configure TESSERACT_CMD.")
        try:
            import pytesseract

            pytesseract.pytesseract.tesseract_cmd = executable
            available = set(pytesseract.get_languages(config=""))
        except (ImportError, OSError, RuntimeError) as exc:
            raise EngineUnavailable("Não foi possível iniciar o Tesseract. Confira a instalação e TESSERACT_CMD.") from exc
        requested = [language for language in self.languages.split("+") if language]
        active = [language for language in requested if language in available]
        if not active and "eng" in available:
            active = ["eng"]
        if not active:
            raise EngineUnavailable("Nenhum idioma OCR configurado está instalado. Instale por.traineddata e eng.traineddata.")
        missing = sorted(set(requested) - available)
        if missing:
            self._language_warnings = [
                f"Idiomas ausentes no Tesseract: {', '.join(missing)}. "
                f"Leitura usando {'+'.join(active)}; acentos podem ter menor precisão."
            ]
        self._active_languages = "+".join(active)
        self._ocr = pytesseract

    def _load_yolo(self) -> None:
        if self._model is not None:
            return
        if not self.model_path.is_file():
            raise EngineUnavailable("Modelo YOLO ausente. Execute: python scripts/download_models.py")
        # Check the distributed checkpoint before PyTorch deserializes it. Custom
        # models must use another filename and come from a source you trust.
        if self.model_path.name == "yolo11n-text.pt":
            digest = hashlib.sha256(self.model_path.read_bytes()).hexdigest()
            if digest != MODEL_SHA256:
                raise EngineUnavailable("O modelo YOLO não passou na verificação SHA-256. Baixe-o novamente.")
        try:
            from ultralytics import YOLO

            model = YOLO(str(self.model_path), task="detect")
        except (ImportError, OSError, RuntimeError, AttributeError, ValueError) as exc:
            raise EngineUnavailable("Não foi possível carregar o YOLO. Confira as dependências e o arquivo do modelo.") from exc
        names = model.names
        labels = list(names.values()) if isinstance(names, dict) else list(names)
        if len(labels) != 1 or str(labels[0]).strip().lower() not in {"text", "texto"}:
            raise EngineUnavailable("Use um modelo YOLO treinado para a classe text; pesos COCO não detectam letras.")
        self._model = model

    def _detect(self, image) -> list[list[int]]:
        results = self._model.predict(
            source=image,
            conf=self.confidence,
            iou=0.45,
            imgsz=640,
            max_det=MAX_REGIONS,
            device=0 if self.gpu else "cpu",
            verbose=False,
        )
        if not results or results[0].boxes is None:
            return []
        regions = []
        for xyxy in results[0].boxes.xyxy.cpu().tolist():
            if len(xyxy) != 4 or not all(math.isfinite(value) for value in xyxy):
                continue
            x1, y1, x2, y2 = xyxy
            margin = max(3, int((y2 - y1) * 0.10))
            box = [max(0, math.floor(x1) - margin), max(0, math.floor(y1) - margin),
                   min(image.width, math.ceil(x2) + margin), min(image.height, math.ceil(y2) + margin)]
            if box[2] > box[0] and box[3] > box[1]:
                regions.append(box)
        return regions

    def _read_crop(self, image, offset: tuple[int, int], psm: int = 6, timeout: float = 8) -> list[dict]:
        from PIL import Image, ImageOps

        # Upscale small character regions and add the modest border Tesseract
        # expects. Coordinates are transformed back to the normalized frame.
        scale = min(2.0, max(1.0, 64.0 / image.height))
        if scale > 1:
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        image = ImageOps.expand(ImageOps.autocontrast(ImageOps.grayscale(image)), border=10, fill="white")
        data = self._ocr.image_to_data(
            image,
            lang=self._active_languages,
            config=f"--oem 3 --psm {psm}",
            output_type=self._ocr.Output.DICT,
            timeout=timeout,
        )
        found = []
        for index, value in enumerate(data["text"]):
            text = " ".join(str(value).split())
            confidence = float(data["conf"][index]) / 100.0
            if not text or not math.isfinite(confidence) or confidence < self.ocr_confidence:
                continue
            left = (int(data["left"][index]) - 10) / scale + offset[0]
            top = (int(data["top"][index]) - 10) / scale + offset[1]
            right = left + int(data["width"][index]) / scale
            bottom = top + int(data["height"][index]) / scale
            found.append({
                "text": text,
                "confidence": round(min(1.0, max(0.0, confidence)), 4),
                "box": [round(left), round(top), round(right), round(bottom)],
            })
        return found

    @staticmethod
    def _reading_order(regions: list[dict], width: int, height: int) -> tuple[list[dict], str]:
        """Group approximately horizontal lines and suppress duplicate crops."""
        unique = []
        for region in sorted(regions, key=lambda item: -item["confidence"]):
            x1, y1, x2, y2 = region["box"]
            region["box"] = [max(0, min(width, x1)), max(0, min(height, y1)),
                             max(0, min(width, x2)), max(0, min(height, y2))]
            x1, y1, x2, y2 = region["box"]
            area = max(0, x2 - x1) * max(0, y2 - y1)
            if area == 0:
                continue
            duplicate = False
            for other in unique:
                a, b, c, d = other["box"]
                overlap = max(0, min(c, x2) - max(a, x1)) * max(0, min(d, y2) - max(b, y1))
                other_area = (c - a) * (d - b)
                if region["text"].casefold() == other["text"].casefold() and overlap / min(area, other_area) > 0.6:
                    duplicate = True
                    break
            if not duplicate:
                unique.append(region)
        lines: list[list[dict]] = []
        for region in sorted(unique, key=lambda item: (item["box"][1], item["box"][0])):
            _, top, _, bottom = region["box"]
            center = (top + bottom) / 2
            for line in lines:
                line_top = min(item["box"][1] for item in line)
                line_bottom = max(item["box"][3] for item in line)
                line_center = (line_top + line_bottom) / 2
                if abs(center - line_center) <= 0.5 * min(bottom - top, line_bottom - line_top):
                    line.append(region)
                    break
            else:
                lines.append([region])
        lines.sort(key=lambda line: min(item["box"][1] for item in line))
        for line in lines:
            line.sort(key=lambda item: item["box"][0])
        ordered = [region for line in lines for region in line]
        text = "\n".join(" ".join(region["text"] for region in line) for line in lines)
        return ordered, text

    def recognize(self, image_bytes: bytes, mode: str | None = None) -> dict:
        selected = mode or self.mode
        if selected not in MODES:
            raise ValueError("Modo inválido. Use yolo_ocr ou ocr.")
        started = time.perf_counter()
        image = self._decode_image(image_bytes)
        with self._lock:
            self._load_ocr()
            messages = list(self._language_warnings)
            try:
                if selected == "yolo_ocr":
                    self._load_yolo()
                    boxes = self._detect(image)
                    if not boxes:
                        messages.append("O YOLO não encontrou regiões de texto. Aproxime a câmera ou experimente o modo Tesseract.")
                    if len(boxes) >= MAX_REGIONS:
                        messages.append("Limite de regiões por quadro atingido. Aproxime a câmera para ler menos texto por vez.")
                    regions = []
                    deadline = time.perf_counter() + 15
                    for x1, y1, x2, y2 in boxes:
                        remaining = deadline - time.perf_counter()
                        if remaining < 0.5:
                            messages.append("Leitura parcial: o quadro contém muitas regiões. Aproxime a câmera.")
                            break
                        regions.extend(self._read_crop(image.crop((x1, y1, x2, y2)), (x1, y1), timeout=min(8, remaining)))
                    if boxes and not regions:
                        # YOLO can locate a line yet crop too tightly for OCR.
                        # Try the full frame once before reporting no text.
                        regions = self._read_crop(image, (0, 0), psm=11, timeout=5)
                        if regions:
                            messages.append("Texto recuperado pela leitura da imagem inteira.")
                    engine = "YOLO11n + Tesseract"
                else:
                    regions = self._read_crop(image, (0, 0), psm=11)
                    engine = "Tesseract (sem YOLO)"
                regions, text = self._reading_order(regions, image.width, image.height)
            except EngineUnavailable:
                raise
            except (RuntimeError, OSError) as exc:
                raise EngineUnavailable("A leitura falhou ou demorou demais. Confira o Tesseract e tente uma imagem menor.") from exc
        return {
            "text": text,
            "regions": regions,
            "width": image.width,
            "height": image.height,
            "engine": engine,
            "elapsed_ms": round((time.perf_counter() - started) * 1000),
            "warnings": messages,
        }
