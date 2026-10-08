import asyncio
from dataclasses import replace
from xml.etree import ElementTree

from fastapi.testclient import TestClient
import httpx
import pytest

from app.config import Settings
from app.main import create_app
from app.natural_voice import NaturalVoice, VoiceError, azure_settings
from test_api import FakeEngine


def test_natural_api_validates_limits_and_returns_audio():
    class Voice:
        async def synthesize(self, text, provider, voice, style, rate, settings):
            assert (provider, voice, style, rate) == ("edge", "pt-BR-FranciscaNeural", "neutral", -15)
            return b"ID3-audio"
    with TestClient(create_app(Settings(), FakeEngine(), natural_voice=Voice())) as client:
        result = client.post("/api/voice/natural", json={"text": "Olá", "rate": -15})
        assert result.content == b"ID3-audio"
        assert result.headers["cache-control"] == "no-store"
        assert result.headers["content-type"] == "audio/mpeg"
        for payload in ({"text": "a" * 601}, {"text": "Olá", "rate": 31}, {"text": " "}, {"text": "oi", "provider": "unknown"}):
            assert client.post("/api/voice/natural", json=payload).status_code == 422


def test_edge_rejects_fake_emotions_and_arbitrary_voices():
    for voice, style in [("pt-BR-FranciscaNeural", "angry"), ("fake", "neutral")]:
        with pytest.raises(VoiceError, match="expressões|Expressões"):
            asyncio.run(NaturalVoice().synthesize("Olá", "edge", voice, style, 0, Settings()))


def test_edge_stream_assembles_audio_and_redacts_remote_errors(monkeypatch):
    import edge_tts
    class Communicator:
        def __init__(self, text, voice, **kwargs):
            assert kwargs["rate"] == "+15%"
        async def stream(self):
            yield {"type": "audio", "data": b"ID3"}
            yield {"type": "SentenceBoundary", "text": "ignored"}
            yield {"type": "audio", "data": b"sound"}
    monkeypatch.setattr(edge_tts, "Communicate", Communicator)
    assert asyncio.run(NaturalVoice().synthesize("Olá", "edge", "pt-BR-AntonioNeural", "neutral", 15, Settings())) == b"ID3sound"
    def broken(*args, **kwargs):
        raise RuntimeError("remote-sensitive-data")
    monkeypatch.setattr(edge_tts, "Communicate", broken)
    with pytest.raises(VoiceError) as exc:
        asyncio.run(NaturalVoice().synthesize("Olá", "edge", "pt-BR-FranciscaNeural", "neutral", 0, Settings()))
    assert "sensitive" not in str(exc.value)


def test_azure_styles_and_xml_escaping():
    requests = []
    def respond(request):
        requests.append(request)
        assert request.url.host == "brazilsouth.tts.speech.microsoft.com"
        assert request.headers["Ocp-Apim-Subscription-Key"] == "secret"
        if request.method == "GET":
            return httpx.Response(200, json=[{"Locale": "pt-BR", "ShortName": "pt-BR-FranciscaNeural", "LocalName": "Francisca", "StyleList": ["calm"]}, {"Locale": "en-US", "ShortName": "other"}])
        body = request.content.decode()
        ElementTree.fromstring(body)
        assert "&lt;audio" in body and "&amp;" in body
        assert 'style="calm"' in body
        assert "<prosody" not in body
        return httpx.Response(200, content=b"ID3-test")
    voice = NaturalVoice(httpx.MockTransport(respond))
    settings = replace(Settings(), azure_region="brazilsouth", azure_key="secret")
    async def run():
        assert len(await voice.azure_catalog(settings)) == 1
        assert await voice.synthesize('<audio src="bad"/> & teste', "azure", "pt-BR-FranciscaNeural", "calm", 0, settings) == b"ID3-test"
        with pytest.raises(VoiceError, match="combinação"):
            await voice.synthesize("oi", "azure", "pt-BR-FranciscaNeural", "angry", 0, settings)
    asyncio.run(run())
    assert len(requests) == 2  # One cached catalog, one synthesis; invalid style never transmitted.


@pytest.mark.parametrize("region", ["https://evil.test", "eastus.evil.test", "eastus/x", "eastus\n"])
def test_azure_region_does_not_become_arbitrary_url(region):
    if region.endswith("\n"):
        assert azure_settings(Settings(), region, "key").azure_region == "eastus"
    else:
        with pytest.raises(VoiceError):
            azure_settings(Settings(), region, "key")


def test_azure_key_reused_only_for_same_region_and_never_exposed(tmp_path):
    settings = replace(Settings(), azure_region="eastus", azure_key="private-key")
    assert azure_settings(settings, "eastus", "").azure_key == "private-key"
    with pytest.raises(VoiceError):
        azure_settings(settings, "brazilsouth", "")
    with pytest.raises(VoiceError):
        azure_settings(settings, "eastus", "bad\nKEY=other")
    class Voice:
        async def azure_catalog(self, settings):
            return [{"id": "pt-BR-FranciscaNeural", "name": "Francisca", "styles": ["calm"]}]
    with TestClient(create_app(settings, FakeEngine(), natural_voice=Voice(), env_path=tmp_path / ".env")) as client:
        assert "private-key" not in client.get("/api/voice/config").text
        result = client.post("/api/voice/config", json={"region": "eastus", "key": "new-secret"})
        assert result.status_code == 200 and "new-secret" not in result.text
        assert client.get("/api/voice/config").json()["configured"] is True
        assert "new-secret" in (tmp_path / ".env").read_text()


def test_voice_lock_prevents_overlapping_synthesis():
    async def run():
        voice = NaturalVoice()
        async with voice.lock:
            with pytest.raises(VoiceError) as exc:
                await voice.synthesize("Olá", "edge", "pt-BR-FranciscaNeural", "neutral", 0, Settings())
            assert exc.value.status_code == 429
    asyncio.run(run())
