import asyncio
import json
from pathlib import Path

from fastapi.testclient import TestClient
import httpx

from app.config import Settings
from app.gemini_vision import GeminiError, GeminiVision
from app.main import create_app


IMAGE = Path(__file__).resolve().parents[1] / "examples" / "teste-leitura.png"


def test_gemini_image_contract_and_source_fallback():
    calls = []

    def handler(request):
        calls.append(request)
        if request.url.host == "generativelanguage.googleapis.com":
            body = json.loads(request.content)
            if "inline_data" in body["contents"][0]["parts"][1]:
                assert request.headers["x-goog-api-key"] == "test-key"
                assert body["generationConfig"]["responseFormat"]["text"]["mimeType"] == "APPLICATION_JSON"
                return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps({
                    "transcription": "Olá", "objects": ["robô", "livro"],
                    "primary_object": "robô", "box_2d": [100, 200, 900, 800],
                })}]}}]})
            assert body["tools"] == [{"google_search": {}}]
            return httpx.Response(429, json={"error": {"status": "RESOURCE_EXHAUSTED"}})
        assert request.url.host == "pt.wikipedia.org"
        return httpx.Response(200, json={"query": {"pages": [{
            "title": "Robô", "extract": "Um robô é uma máquina programável.",
            "fullurl": "https://pt.wikipedia.org/wiki/Rob%C3%B4",
        }]}})

    async def scenario():
        service = GeminiVision(httpx.MockTransport(handler))
        settings = Settings(gemini_key="test-key")
        analysis = await service.analyze(IMAGE.read_bytes(), settings)
        assert analysis["transcription"] == "Olá"
        assert analysis["objects"] == ["robô", "livro"]
        assert len(analysis["regions"]) == 1
        assert analysis["regions"][0]["box"][0] < analysis["regions"][0]["box"][2]
        report = await service.research(analysis, settings)
        assert "máquina programável" in report["spoken_text"]
        assert report["sources"] == [{"title": "Wikipédia: Robô", "url": "https://pt.wikipedia.org/wiki/Rob%C3%B4"}]
        assert "cota" not in " ".join(report["warnings"])

    asyncio.run(scenario())
    assert len(calls) == 3


def test_gemini_config_is_private_and_required(tmp_path):
    class FakeEngine:
        def status(self):
            return {"ready": True, "model_exists": True}

    class FakeGemini:
        async def verify_key(self, settings):
            assert settings.gemini_key == "test-key"

        async def analyze(self, image, settings):
            if not settings.gemini_key:
                raise GeminiError("Conecte Gemini.", 400)
            assert image == b"photo"
            assert settings.gemini_key == "test-key"
            return {"text": "Objeto: livro", "spoken_text": "Um livro", "objects": ["livro"],
                    "primary_object": "livro", "regions": [], "width": 10, "height": 10, "warnings": []}

        async def research(self, analysis, settings):
            analysis["sources"] = [{"title": "Fonte", "url": "https://example.org"}]
            return analysis

    with TestClient(create_app(Settings(), engine=FakeEngine(), env_path=tmp_path / ".env",
                               gemini_vision=FakeGemini())) as client:
        upload = {"file": ("photo.png", b"photo", "image/png")}
        assert client.post("/api/recognize", files=upload, data={"mode": "gemini"}).status_code == 400
        response = client.post("/api/gemini/config", json={"key": "test-key"})
        assert response.status_code == 200
        assert "test-key" not in response.text
        assert client.get("/api/gemini/config").json() == {
            "configured": True, "model": "gemini-3.5-flash-lite"}
        assert "test-key" not in client.get("/api/status").text
        report = client.post("/api/recognize", files=upload, data={"mode": "gemini_research"})
        assert report.status_code == 200
        assert report.json()["sources"][0]["title"] == "Fonte"
    assert "test-key" in (tmp_path / ".env").read_text()
