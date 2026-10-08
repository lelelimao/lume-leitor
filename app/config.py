from dataclasses import dataclass
from pathlib import Path
import os

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    mode: str = "yolo_ocr"
    model_path: str = str(ROOT / "models" / "yolo11n-text.pt")
    tesseract_cmd: str | None = None
    languages: str = "por+eng"
    gpu: bool = False
    ha_url: str = ""
    ha_token: str = ""
    alexa_entity: str = ""
    azure_region: str = ""
    azure_key: str = ""
    max_image_bytes: int = 8 * 1024 * 1024

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env", override=False)
        model = Path(os.getenv("YOLO_MODEL_PATH", "models/yolo11n-text.pt"))
        if not model.is_absolute():
            model = ROOT / model
        command = os.getenv("TESSERACT_CMD") or None
        local_tesseract = ROOT / "tools" / "tesseract" / "tesseract.exe"
        if not command and local_tesseract.is_file():
            command = str(local_tesseract)
        return cls(
            mode=os.getenv("VISION_MODE", "yolo_ocr"), model_path=str(model),
            tesseract_cmd=command, languages=os.getenv("OCR_LANGUAGES", "por+eng"),
            gpu=os.getenv("USE_GPU", "false").lower() == "true",
            ha_url=os.getenv("HOME_ASSISTANT_URL", "").rstrip("/"),
            ha_token=os.getenv("HOME_ASSISTANT_TOKEN", ""),
            alexa_entity=os.getenv("ALEXA_ENTITY_ID", ""),
            azure_region=os.getenv("AZURE_SPEECH_REGION", ""),
            azure_key=os.getenv("AZURE_SPEECH_KEY", ""),
        )
