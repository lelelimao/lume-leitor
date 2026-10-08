import asyncio
from dataclasses import replace
import json

from fastapi.testclient import TestClient
import httpx
import pytest

from app.alexa import AlexaError, AlexaSpeaker, split_text
from app.config import Settings
from app.main import create_app
from app.vision import EngineUnavailable


class FakeEngine:
    def status(self):
        return {"ready": True, "model_exists": True, "mode": "yolo_ocr"}

    def recognize(self, contents, mode):
        if contents == b"bad":
            raise ValueError("Imagem inválida")
        if contents == b"missing":
            raise EngineUnavailable("Instale Tesseract")
        return {"text": "Olá mundo", "regions": [], "width": 100, "height": 50,
                "engine": mode, "elapsed_ms": 12, "warnings": []}


@pytest.fixture
def client():
    with TestClient(create_app(Settings(), FakeEngine())) as value:
        yield value


def test_status_does_not_reveal_credentials(client):
    response = client.get("/api/status")
    assert response.status_code == 200
    assert response.json()["alexa"] == {"configured": False}
    assert "token" not in response.text.lower()


def test_home_and_reader_routes(client):
    home = client.get("/")
    reader = client.get("/leitor")
    assert "Os limites das máquinas" in home.text
    assert "id=\"camera-stage\"" in reader.text
    assert "Voltar à apresentação" in reader.text
    assert home.headers["cache-control"] == reader.headers["cache-control"] == "no-store"


def test_recognition_contract(client):
    response = client.post("/api/recognize", files={"file": ("frame.jpg", b"fixture", "image/jpeg")},
                           data={"mode": "ocr"})
    assert response.status_code == 200
    assert response.json()["text"] == "Olá mundo"
    assert response.json()["engine"] == "ocr"


@pytest.mark.parametrize("contents,status", [(b"", 400), (b"bad", 400), (b"missing", 503)])
def test_clear_recognition_errors(client, contents, status):
    assert client.post("/api/recognize", files={"file": ("x.png", contents)}).status_code == status


def test_limits_and_untrusted_origin(client):
    assert client.post("/api/recognize", content=b"", headers={"Content-Length": "99999999"}).status_code == 413
    assert client.post("/api/speak", json={"text": "Olá"}, headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/api/status", headers={"Host": "evil.example"}).status_code == 400


def test_speech_validation_and_missing_configuration(client):
    assert client.post("/api/speak", json={"text": "  "}).status_code == 422
    assert client.post("/api/speak", json={"text": "a" * 4001}).status_code == 422
    assert client.post("/api/speak", json={"text": "Olá mundo"}).status_code == 503


def configured():
    return replace(Settings(), ha_url="http://homeassistant.local:8123", ha_token="test-secret",
                   alexa_entity="media_player.echo_sala")


def test_alexa_payload_dedup_and_force():
    received = []

    def handler(request):
        assert request.url.path == "/api/services/notify/alexa_media"
        assert request.headers["authorization"] == "Bearer test-secret"
        received.append(json.loads(request.content))
        return httpx.Response(200, json=[])

    async def scenario():
        speaker = AlexaSpeaker(configured(), httpx.MockTransport(handler))
        assert (await speaker.speak("Olá <mundo>"))["status"] == "sent"
        assert (await speaker.speak("OLÁ <mundo>"))["status"] == "duplicate"
        speaker.busy_until = 0
        assert (await speaker.speak("Olá <mundo>", force=True))["status"] == "sent"

    asyncio.run(scenario())
    assert len(received) == 2
    assert received[0] == {"message": "Olá &lt;mundo&gt;", "target": ["media_player.echo_sala"],
                           "data": {"type": "tts"}}


def test_failed_speech_can_be_retried_without_false_dedup():
    attempts = []

    def handler(request):
        attempts.append(1)
        return httpx.Response(401 if len(attempts) == 1 else 200, json=[])

    async def scenario():
        speaker = AlexaSpeaker(configured(), httpx.MockTransport(handler))
        with pytest.raises(AlexaError, match="token"):
            await speaker.speak("Olá")
        assert (await speaker.speak("Olá"))["status"] == "sent"

    asyncio.run(scenario())


def test_speech_chunks_preserve_text():
    text = ("ação e informação " * 90).strip()
    chunks = split_text(text)
    assert len(chunks) > 1
    assert max(map(len, chunks)) <= 450
    assert " ".join(chunks) == text


def test_alexa_rate_limit():
    async def scenario():
        speaker = AlexaSpeaker(configured())
        speaker.busy_until = float("inf")
        with pytest.raises(AlexaError) as exc:
            await speaker.speak("a")
        assert exc.value.status_code == 429
    asyncio.run(scenario())
