import logging
import asyncio
from pathlib import Path
from threading import BoundedSemaphore
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .alexa import AlexaError, AlexaSpeaker
from .config import ROOT, Settings
from .alexa_setup import connection_settings, discover, save_settings
from .google_voice import GoogleVoice
from .natural_voice import EDGE_VOICES, NaturalVoice, VoiceError, azure_settings, save_azure
from .vision import EngineUnavailable, RecognitionEngine

STATIC = Path(__file__).parent / "static"
logger = logging.getLogger("lume")


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    force: bool = False

    @field_validator("text")
    @classmethod
    def nonempty(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Digite ou reconheça algum texto antes de ler.")
        return value


class AlexaConfigRequest(BaseModel):
    url: str = Field(min_length=1, max_length=500)
    token: str = Field(default="", max_length=4096)
    entity: str = Field(default="", max_length=200)


class NaturalSpeechRequest(SpeechRequest):
    text: str = Field(min_length=1, max_length=600)
    provider: Literal["edge", "azure"] = "edge"
    voice: str = Field(default="pt-BR-FranciscaNeural", max_length=120)
    style: str = Field(default="neutral", max_length=80)
    rate: int = Field(default=0, ge=-30, le=30)


class AzureConfigRequest(BaseModel):
    region: str = Field(min_length=1, max_length=40)
    key: str = Field(default="", max_length=4096)


def create_app(settings=None, engine=None, speaker=None, env_path=None, google_voice=None, natural_voice=None):
    settings = settings or Settings.from_env()
    engine = engine or RecognitionEngine(mode=settings.mode, model_path=settings.model_path,
                                        tesseract_cmd=settings.tesseract_cmd,
                                        languages=settings.languages, gpu=settings.gpu)
    speaker = speaker or AlexaSpeaker(settings)
    env_path = env_path or ROOT / ".env"
    google_voice = google_voice or GoogleVoice()
    natural_voice = natural_voice or NaturalVoice()
    config_lock = asyncio.Lock()
    app = FastAPI(title="Lume · Leitor visual", version="2.0.0")
    app.state.engine = engine
    app.state.speaker = speaker
    gate = BoundedSemaphore(1)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"])

    @app.middleware("http")
    async def local_requests(request: Request, call_next):
        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and (urlsplit(origin).netloc != request.headers.get("host")
                           or urlsplit(origin).scheme != request.url.scheme):
                return JSONResponse({"detail": "Origem da requisição não autorizada."}, 403)
            length = request.headers.get("content-length")
            if length is None:
                return JSONResponse({"detail": "Informe Content-Length."}, 411)
            try:
                too_large = int(length) > settings.max_image_bytes + 256 * 1024
            except ValueError:
                return JSONResponse({"detail": "Tamanho de requisição inválido."}, 400)
            if too_large:
                return JSONResponse({"detail": "A imagem deve ter até 8 MB."}, 413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
        return response

    @app.get("/")
    def index():
        return FileResponse(STATIC / "home.html", headers={"Cache-Control": "no-store"})

    @app.get("/leitor")
    def reader():
        return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-store"})

    @app.get("/api/status")
    async def status():
        vision = await run_in_threadpool(engine.status)
        return {"name": "Lume", "version": "2.0.0", "vision": vision,
                "alexa": {"configured": speaker.configured}, "limits": {"max_image_mb": 8}}

    @app.post("/api/recognize")
    async def recognize(file: UploadFile = File(...), mode: Literal["yolo_ocr", "ocr"] = Form("yolo_ocr")):
        try:
            contents = await file.read(settings.max_image_bytes + 1)
        finally:
            await file.close()
        if len(contents) > settings.max_image_bytes:
            raise HTTPException(413, "A imagem deve ter até 8 MB.")
        if not contents:
            raise HTTPException(400, "A imagem enviada está vazia.")
        if not gate.acquire(blocking=False):
            raise HTTPException(429, "Uma imagem já está sendo processada. Aguarde um instante.")
        try:
            return await run_in_threadpool(engine.recognize, contents, mode)
        except EngineUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            logger.exception("Falha no reconhecimento")
            raise HTTPException(500, "Não foi possível ler a imagem. Confira o terminal do servidor.") from exc
        finally:
            gate.release()

    @app.post("/api/speak")
    async def speak(payload: SpeechRequest):
        try:
            return await speaker.speak(payload.text, payload.force)
        except AlexaError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc

    @app.post("/api/voice/google")
    async def google_speech(payload: SpeechRequest):
        if len(payload.text) > 600:
            raise HTTPException(400, "Envie até 600 caracteres por trecho de voz Google.")
        try:
            data = await run_in_threadpool(google_voice.synthesize, payload.text)
            return Response(data, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
        except Exception as exc:
            raise HTTPException(503, "A voz Google está indisponível. Verifique a internet ou selecione Voz do navegador.") from exc

    @app.get("/api/alexa/config")
    async def alexa_config():
        return {"url": settings.ha_url, "entity": settings.alexa_entity,
                "token_saved": bool(settings.ha_token), "configured": speaker.configured}

    @app.get("/api/voice/catalog")
    async def voice_catalog(provider: Literal["edge", "azure"] = "edge"):
        try:
            return {"voices": EDGE_VOICES if provider == "edge" else await natural_voice.azure_catalog(settings)}
        except VoiceError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc

    @app.post("/api/voice/natural")
    async def natural_speech(payload: NaturalSpeechRequest):
        try:
            data = await natural_voice.synthesize(payload.text, payload.provider, payload.voice, payload.style, payload.rate, settings)
            return Response(data, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
        except VoiceError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc

    @app.get("/api/voice/config")
    async def voice_config():
        return {"region": settings.azure_region, "key_saved": bool(settings.azure_key),
                "configured": bool(settings.azure_region and settings.azure_key)}

    @app.post("/api/voice/config")
    async def save_voice_config(payload: AzureConfigRequest):
        nonlocal settings
        async with config_lock:
            try:
                candidate = azure_settings(settings, payload.region, payload.key)
                voices = await natural_voice.azure_catalog(candidate)
                await run_in_threadpool(save_azure, env_path, candidate)
                settings = candidate
                speaker.settings = candidate
                return {"configured": True, "voices": voices, "message": "Azure conectado. As expressões disponíveis aparecem ao escolher uma voz."}
            except VoiceError as exc:
                raise HTTPException(exc.status_code, str(exc)) from exc
            except OSError as exc:
                raise HTTPException(500, "Não foi possível salvar a chave no arquivo .env.") from exc

    @app.post("/api/alexa/discover")
    async def alexa_discover(payload: AlexaConfigRequest):
        try:
            candidate = connection_settings(settings, payload.url, payload.token)
            return await discover(candidate)
        except AlexaError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc

    @app.post("/api/alexa/config")
    async def alexa_save(payload: AlexaConfigRequest):
        nonlocal settings, speaker
        async with config_lock:
            try:
                candidate = connection_settings(settings, payload.url, payload.token, payload.entity)
                if not candidate.alexa_entity:
                    raise AlexaError("Selecione o dispositivo Echo.", 400)
                found = await discover(candidate)
                if candidate.alexa_entity not in [item["entity_id"] for item in found["devices"]]:
                    raise AlexaError("Esse dispositivo não está na lista do Home Assistant.", 400)
                if speaker.lock.locked():
                    raise AlexaError("Aguarde o envio da fala atual antes de alterar a configuração.", 409)
                await run_in_threadpool(save_settings, env_path, candidate)
                settings = candidate
                # Keep the same speaker object: in-flight requests share its lock/cooldown.
                speaker.settings = candidate
                speaker.last_text = ""
                return {"message": "Alexa configurada. Teste a voz e selecione Alexa como saída.", "configured": True}
            except AlexaError as exc:
                raise HTTPException(exc.status_code, str(exc)) from exc
            except OSError as exc:
                raise HTTPException(500, "Não foi possível salvar o arquivo .env. Confira a permissão da pasta.") from exc

    app.mount("/static", StaticFiles(directory=STATIC, check_dir=False), name="static")
    return app


app = create_app()
