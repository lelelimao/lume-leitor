import asyncio
from dataclasses import replace

from dotenv import dotenv_values
from fastapi.testclient import TestClient
import httpx
import pytest

from app.alexa import AlexaError
from app.alexa_setup import connection_settings, discover, save_settings
from app.config import Settings
from app.main import create_app
from test_api import FakeEngine


def test_connection_reuses_token_only_for_same_server():
    settings = replace(Settings(), ha_url="http://ha.local:8123", ha_token="secret")
    assert connection_settings(settings, settings.ha_url, "").ha_token == "secret"
    with pytest.raises(AlexaError, match="token"):
        connection_settings(settings, "http://different.local", "")


@pytest.mark.parametrize("url", ["file:///tmp", "http://user:password@ha.local", "http://ha.local/?token=x", "http://ha.local/#x"])
def test_bad_server_urls_rejected(url):
    with pytest.raises(AlexaError):
        connection_settings(Settings(), url, "secret")


def test_newline_token_rejected():
    with pytest.raises(AlexaError):
        connection_settings(Settings(), "http://ha.local", "secret\nYOLO_MODEL_PATH=bad")


def test_discovery_and_missing_integration():
    def response(request):
        assert request.headers["Authorization"] == "Bearer secret"
        return httpx.Response(200, json=[{"domain": "notify", "services": {"alexa_media": {}}}]
                              if request.url.path.endswith("services") else [
                                  {"entity_id": "sensor.temperature", "state": "20"},
                                  {"entity_id": "media_player.echo", "state": "idle", "attributes": {"friendly_name": "Echo sala"}}])
    settings = connection_settings(Settings(), "http://ha.local", "secret")
    result = asyncio.run(discover(settings, httpx.MockTransport(response)))
    assert result["devices"][0]["name"] == "Echo sala"
    assert len(result["devices"]) == 1
    with pytest.raises(AlexaError, match="notify.alexa_media"):
        asyncio.run(discover(settings, httpx.MockTransport(lambda request: httpx.Response(200, json=[]))))


def test_save_preserves_other_values_and_secret_roundtrip(tmp_path):
    path = tmp_path / ".env"
    path.write_text("# camera\nVISION_MODE=ocr\n", encoding="utf-8")
    settings = connection_settings(Settings(), "http://ha.local", "it's-a-secret", "media_player.echo")
    save_settings(path, settings)
    saved = dotenv_values(path)
    assert saved["VISION_MODE"] == "ocr"
    assert saved["HOME_ASSISTANT_TOKEN"] == "it's-a-secret"
    assert "# camera" in path.read_text()


def test_configuration_api_hides_secret_and_updates_without_restart(tmp_path, monkeypatch):
    async def found(settings):
        return {"devices": [{"entity_id": "media_player.echo", "name": "Echo"}]}
    monkeypatch.setattr("app.main.discover", found)
    app = create_app(Settings(), FakeEngine(), env_path=tmp_path / ".env")
    with TestClient(app) as client:
        response = client.post("/api/alexa/config", json={"url": "http://ha.local", "token": "super-secret", "entity": "media_player.echo"})
        assert response.status_code == 200
        config = client.get("/api/alexa/config")
        assert config.json()["token_saved"] is True
        assert "super-secret" not in config.text
        assert client.get("/api/status").json()["alexa"]["configured"] is True
        assert client.post("/api/alexa/config", json={"url": "http://ha.local", "entity": "media_player.missing"}).status_code == 400


def test_google_audio_api_and_limits():
    class Voice:
        def synthesize(self, text):
            assert text == "Olá mundo"
            return b"ID3-test-audio"
    with TestClient(create_app(Settings(), FakeEngine(), google_voice=Voice())) as client:
        response = client.post("/api/voice/google", json={"text": "Olá mundo"})
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/mpeg"
        assert response.headers["cache-control"] == "no-store"
        assert client.post("/api/voice/google", json={"text": "a" * 601}).status_code == 400


def test_google_error_has_no_raw_remote_details():
    class Voice:
        def synthesize(self, text):
            raise RuntimeError("sensitive-internal-detail")
    with TestClient(create_app(Settings(), FakeEngine(), google_voice=Voice())) as client:
        response = client.post("/api/voice/google", json={"text": "Olá"})
        assert response.status_code == 503
        assert "sensitive" not in response.text
