"""Neural speech: Edge without credentials; optional Azure styles from its live catalog."""
import asyncio
from dataclasses import replace
import re
import time
from xml.sax.saxutils import escape, quoteattr

from dotenv import set_key
import httpx


EDGE_VOICES = [
    {"id": "pt-BR-FranciscaNeural", "name": "Francisca", "styles": []},
    {"id": "pt-BR-AntonioNeural", "name": "Antônio", "styles": []},
]


class VoiceError(Exception):
    def __init__(self, message, status_code=503):
        super().__init__(message)
        self.status_code = status_code


def azure_settings(settings, region, key):
    region = region.strip().lower()
    if not re.fullmatch(r"[a-z][a-z0-9]{2,39}", region):
        raise VoiceError("Informe a região do recurso, como brazilsouth ou eastus.", 400)
    if any(char in key for char in "\r\n\x00"):
        raise VoiceError("A chave contém caracteres inválidos.", 400)
    key = key.strip() or (settings.azure_key if region == settings.azure_region else "")
    if not key:
        raise VoiceError("Informe a chave do recurso Azure Speech.", 400)
    return replace(settings, azure_region=region, azure_key=key)


def save_azure(path, settings):
    for key, value in (("AZURE_SPEECH_REGION", settings.azure_region), ("AZURE_SPEECH_KEY", settings.azure_key)):
        set_key(str(path), key, value, quote_mode="always")


class NaturalVoice:
    def __init__(self, transport=None):
        self.transport = transport
        self.lock = asyncio.Lock()
        self._catalog = None
        self._catalog_key = None
        self._catalog_time = 0

    async def azure_catalog(self, settings):
        if not settings.azure_region or not settings.azure_key:
            raise VoiceError("Configure sua conta Azure para usar expressões de voz.", 400)
        # Region is part of a fixed Microsoft host, never an arbitrary URL.
        azure_settings(settings, settings.azure_region, settings.azure_key)
        cache_key = (settings.azure_region, settings.azure_key)
        if self._catalog_key == cache_key and time.monotonic() - self._catalog_time < 3600:
            return self._catalog
        try:
            async with httpx.AsyncClient(timeout=20, transport=self.transport) as client:
                result = await client.get(
                    f"https://{settings.azure_region}.tts.speech.microsoft.com/cognitiveservices/voices/list",
                    headers={"Ocp-Apim-Subscription-Key": settings.azure_key})
            if result.status_code in (401, 403):
                raise VoiceError("A chave foi recusada. Confira a chave e a região do mesmo recurso Speech.", 400)
            result.raise_for_status()
            voices = [{"id": item["ShortName"], "name": item.get("LocalName", item["ShortName"]),
                       "styles": item.get("StyleList", [])}
                      for item in result.json() if item.get("Locale") == "pt-BR"]
            if not voices:
                raise VoiceError("Nenhuma voz brasileira foi disponibilizada por essa região.")
            self._catalog, self._catalog_key, self._catalog_time = voices, cache_key, time.monotonic()
            return voices
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise VoiceError("Não foi possível consultar as vozes Azure. Confira internet e região.") from exc

    async def synthesize(self, text, provider, voice, style, rate, settings):
        if self.lock.locked():
            raise VoiceError("Uma voz está sendo preparada. Aguarde um instante.", 429)
        async with self.lock:
            if provider == "edge":
                if voice not in {item["id"] for item in EDGE_VOICES} or style != "neutral":
                    raise VoiceError("Escolha uma voz natural válida. Expressões extras exigem Azure.", 400)
                try:
                    import edge_tts
                    communicator = edge_tts.Communicate(text, voice, rate=f"{rate:+d}%", connect_timeout=10, receive_timeout=25)
                    audio = bytearray()
                    async with asyncio.timeout(45):
                        async for chunk in communicator.stream():
                            if chunk["type"] == "audio":
                                audio.extend(chunk["data"])
                    if not audio:
                        raise VoiceError("O serviço de voz natural não retornou áudio.")
                    return bytes(audio)
                except (VoiceError, asyncio.CancelledError):
                    raise
                except Exception as exc:
                    raise VoiceError("Voz natural indisponível. Confira a internet ou escolha outra saída de voz.") from exc
            catalog = await self.azure_catalog(settings)
            selected = next((item for item in catalog if item["id"] == voice), None)
            if not selected or (style != "neutral" and style not in selected["styles"]):
                raise VoiceError("Esta combinação de voz e expressão não está disponível na sua região Azure.", 400)
            body = escape(text)
            if style != "neutral":
                body = f'<mstts:express-as style={quoteattr(style)}>{body}</mstts:express-as>'
            # Some new HD voices do not accept prosody. Neutral rate omits it entirely.
            if rate:
                body = f'<prosody rate="{rate:+d}%">{body}</prosody>'
            ssml = ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
                    'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="pt-BR">'
                    f'<voice name={quoteattr(voice)}>{body}</voice></speak>')
            try:
                async with httpx.AsyncClient(timeout=40, transport=self.transport) as client:
                    result = await client.post(
                        f"https://{settings.azure_region}.tts.speech.microsoft.com/cognitiveservices/v1",
                        headers={"Ocp-Apim-Subscription-Key": settings.azure_key,
                                 "Content-Type": "application/ssml+xml", "User-Agent": "LumeReader",
                                 "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3"},
                        content=ssml.encode("utf-8"))
                result.raise_for_status()
                if not result.content:
                    raise VoiceError("O Azure não retornou áudio.")
                return result.content
            except httpx.HTTPError as exc:
                raise VoiceError("Azure não concluiu a fala. Confira a conta, a cota e a compatibilidade da voz; tente ritmo normal.") from exc
