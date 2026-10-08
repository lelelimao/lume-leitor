"""Vision contract tests; no model downloads, GPU or camera required."""

import io
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import Mock

from PIL import Image
import pytest

from app.vision import EngineUnavailable, RecognitionEngine
from scripts import download_models


def image_bytes(size=(240, 120), mode="RGB"):
    buffer = io.BytesIO()
    Image.new(mode, size, "white").save(buffer, format="PNG")
    return buffer.getvalue()


def ocr_data(*words):
    """Each input is (text, confidence out of 100, x, y, w, h)."""
    return {name: [word[index] for word in words] for index, name in enumerate(
        ["text", "conf", "left", "top", "width", "height"]
    )}


def fake_ocr(engine, result):
    reader = SimpleNamespace(Output=SimpleNamespace(DICT="dict"), image_to_data=Mock(return_value=result))
    engine._ocr = reader
    engine._active_languages = "por+eng"
    return reader


def test_invalid_image_is_rejected_before_model_initialization(monkeypatch):
    engine = RecognitionEngine()
    initialize = Mock()
    monkeypatch.setattr(engine, "_load_ocr", initialize)
    with pytest.raises(ValueError, match="inválido|corrompido"):
        engine.recognize(b"not an image")
    initialize.assert_not_called()


def test_ocr_filters_confidence_preserves_accents_and_reading_order():
    engine = RecognitionEngine(mode="ocr")
    reader = fake_ocr(engine, ocr_data(
        ("mundo", 90, 110, 31, 40, 20),
        ("Olá", 95, 20, 30, 30, 20),
        ("ruído", 12, 20, 70, 30, 20),
        ("", -1, 0, 0, 0, 0),
        ("ação", 92, 20, 70, 35, 20),
    ))
    result = engine.recognize(image_bytes())
    assert result["text"] == "Olá mundo\nação"
    assert result["engine"] == "Tesseract (sem YOLO)"
    assert result["regions"][0]["box"] == [10, 20, 40, 40]
    assert result["regions"][0]["confidence"] == 0.95
    assert reader.image_to_data.call_args.kwargs["lang"] == "por+eng"


def test_yolo_crops_are_read_and_coordinates_map_to_full_frame(monkeypatch):
    engine = RecognitionEngine()
    reader = fake_ocr(engine, ocr_data(("Brasil", 98, 20, 30, 50, 20)))
    monkeypatch.setattr(engine, "_load_yolo", Mock())
    monkeypatch.setattr(engine, "_detect", Mock(return_value=[[40, 20, 200, 100]]))
    result = engine.recognize(image_bytes())
    assert result["text"] == "Brasil"
    assert result["regions"][0]["box"] == [50, 40, 100, 60]
    assert result["engine"] == "YOLO11n + Tesseract"
    # The OCR receives the crop, plus its 10 pixel border on each side.
    assert reader.image_to_data.call_args.args[0].size == (180, 100)


def test_small_crop_upscaling_does_not_change_frame_coordinates(monkeypatch):
    engine = RecognitionEngine()
    fake_ocr(engine, ocr_data(("A", 98, 30, 20, 20, 20)))
    monkeypatch.setattr(engine, "_load_yolo", Mock())
    monkeypatch.setattr(engine, "_detect", Mock(return_value=[[40, 20, 80, 40]]))
    result = engine.recognize(image_bytes())
    assert result["regions"][0]["box"] == [50, 25, 60, 35]


def test_yolo_with_no_text_does_not_silently_fall_back(monkeypatch):
    engine = RecognitionEngine()
    reader = fake_ocr(engine, ocr_data())
    monkeypatch.setattr(engine, "_load_yolo", Mock())
    monkeypatch.setattr(engine, "_detect", Mock(return_value=[]))
    result = engine.recognize(image_bytes())
    assert result["text"] == ""
    assert result["regions"] == []
    assert "YOLO" in result["warnings"][0]
    reader.image_to_data.assert_not_called()


def test_yolo_crop_without_ocr_words_tries_full_frame(monkeypatch):
    engine = RecognitionEngine()
    reader = fake_ocr(engine, ocr_data())
    reader.image_to_data.side_effect = [ocr_data(), ocr_data(("Frase", 95, 20, 20, 70, 20))]
    monkeypatch.setattr(engine, "_load_yolo", Mock())
    monkeypatch.setattr(engine, "_detect", Mock(return_value=[[40, 20, 200, 100]]))
    result = engine.recognize(image_bytes())
    assert result["text"] == "Frase"
    assert reader.image_to_data.call_count == 2
    assert "--psm 11" in reader.image_to_data.call_args.kwargs["config"]
    assert any("imagem inteira" in warning for warning in result["warnings"])


def test_ocr_mode_override_does_not_require_yolo_model(monkeypatch):
    engine = RecognitionEngine()
    fake_ocr(engine, ocr_data(("ABC", 98, 20, 20, 50, 20)))
    initialize_yolo = Mock(side_effect=AssertionError("YOLO must not load"))
    monkeypatch.setattr(engine, "_load_yolo", initialize_yolo)
    assert engine.recognize(image_bytes(), mode="ocr")["text"] == "ABC"
    initialize_yolo.assert_not_called()


def test_large_images_are_normalized_to_documented_dimensions():
    engine = RecognitionEngine(mode="ocr")
    fake_ocr(engine, ocr_data())
    result = engine.recognize(image_bytes((3200, 1800)))
    assert (result["width"], result["height"]) == (1600, 900)


def test_repeated_overlapping_words_are_only_read_once():
    regions = [
        {"text": "Olá", "confidence": 0.98, "box": [0, 0, 35, 20]},
        {"text": "Olá", "confidence": 0.80, "box": [1, 1, 36, 21]},
        {"text": "Olá", "confidence": 0.90, "box": [100, 0, 135, 20]},
    ]
    ordered, text = RecognitionEngine._reading_order(regions, 240, 120)
    assert text == "Olá Olá"
    assert len(ordered) == 2


def test_missing_portuguese_has_explicit_warning(monkeypatch):
    engine = RecognitionEngine(mode="ocr")
    pytesseract = SimpleNamespace(
        pytesseract=SimpleNamespace(tesseract_cmd=None),
        get_languages=Mock(return_value=["eng", "osd"]),
    )
    monkeypatch.setitem(sys.modules, "pytesseract", pytesseract)
    monkeypatch.setattr(engine, "_find_tesseract", lambda: "tesseract")
    engine._load_ocr()
    assert engine._active_languages == "eng"
    assert "por" in engine._language_warnings[0]


def test_tampered_default_checkpoint_is_rejected_before_torch_load(tmp_path):
    checkpoint = tmp_path / "yolo11n-text.pt"
    checkpoint.write_bytes(b"untrusted model")
    engine = RecognitionEngine(model_path=str(checkpoint))
    with pytest.raises(EngineUnavailable, match="SHA-256"):
        engine._load_yolo()


def test_generic_object_detector_is_rejected(tmp_path, monkeypatch):
    checkpoint = tmp_path / "custom.pt"
    checkpoint.write_bytes(b"mock checkpoint")
    model = SimpleNamespace(names={0: "person", 1: "car"})
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=Mock(return_value=model)))
    engine = RecognitionEngine(model_path=str(checkpoint))
    with pytest.raises(EngineUnavailable, match="COCO"):
        engine._load_yolo()


def test_tesseract_timeout_becomes_actionable_runtime_error():
    engine = RecognitionEngine(mode="ocr")
    reader = fake_ocr(engine, ocr_data())
    reader.image_to_data.side_effect = RuntimeError("Tesseract process timeout")
    with pytest.raises(EngineUnavailable, match="demorou demais"):
        engine.recognize(image_bytes())


def test_model_downloader_rejects_bad_hash_without_overwriting_existing_file(tmp_path, monkeypatch):
    output = tmp_path / "yolo11n-text.pt"
    output.write_bytes(b"existing checkpoint")
    monkeypatch.setattr(download_models, "MODEL_SIZE", 7)
    monkeypatch.setattr(download_models, "urlopen", lambda *a, **kw: io.BytesIO(b"corrupt"))
    with pytest.raises(ValueError, match="SHA-256"):
        download_models.download(output)
    assert output.read_bytes() == b"existing checkpoint"
    assert list(tmp_path.glob("*.part")) == []


def test_status_does_not_initialize_inference(monkeypatch):
    engine = RecognitionEngine(mode="ocr")
    monkeypatch.setattr(engine, "_find_tesseract", lambda: "tesseract")
    monkeypatch.setattr("app.vision.importlib.util.find_spec", lambda name: object())
    status = engine.status()
    assert status["ready"] is True
    assert status["loaded"] is False
    assert engine._model is None
    assert engine._ocr is None


@pytest.mark.parametrize("mode", ["yolo", "tesseract", "bad"])
def test_unknown_modes_are_rejected(mode):
    with pytest.raises(ValueError, match="Modo inválido"):
        RecognitionEngine(mode=mode)
