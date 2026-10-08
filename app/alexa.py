"""Envio de TTS ao Echo via Home Assistant / Alexa Media Player."""
import asyncio
import html
import re
import textwrap
import time
from urllib.parse import urlsplit

import httpx

from .config import Settings


class AlexaError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def split_text(text: str, size: int = 450) -> list[str]:
    # Preserve every word, including tokens longer than the chunk limit.
    return textwrap.wrap(" ".join(text.split()), width=size, break_long_words=True,
                         break_on_hyphens=False, replace_whitespace=True)


class AlexaSpeaker:
    def __init__(self, settings: Settings, transport=None):
        self.settings = settings
        self.transport = transport
        self.lock = asyncio.Lock()
        self.last_text = ""
        self.busy_until = 0.0

    @property
    def configured(self):
        url = urlsplit(self.settings.ha_url)
        return bool(url.scheme in ("http", "https") and url.netloc
                    and not url.username and not url.password
                    and self.settings.ha_token
                    and re.fullmatch(r"media_player\.[a-z0-9_]+", self.settings.alexa_entity))

    async def speak(self, text: str, force: bool = False):
        if not self.configured:
            raise AlexaError("Configure Home Assistant e Alexa Media Player no arquivo .env. "
                             "Você pode usar a voz do navegador enquanto isso.", 503)
        normalized = " ".join(text.casefold().split())
        if not force and normalized == self.last_text:
            return {"status": "duplicate", "message": "Este texto já foi enviado à Alexa."}
        if self.lock.locked() or time.monotonic() < self.busy_until:
            raise AlexaError("Aguarde a fala atual da Alexa terminar e tente novamente.", 429)
        async with self.lock:
            chunks = split_text(text)
            sent = 0
            try:
                async with httpx.AsyncClient(timeout=20, transport=self.transport,
                                             follow_redirects=False, trust_env=False) as client:
                    for index, chunk in enumerate(chunks):
                        response = await client.post(
                            f"{self.settings.ha_url}/api/services/notify/alexa_media",
                            headers={"Authorization": f"Bearer {self.settings.ha_token}"},
                            json={"message": html.escape(chunk),
                                  "target": [self.settings.alexa_entity], "data": {"type": "tts"}},
                        )
                        if response.status_code in (401, 403):
                            raise AlexaError("O Home Assistant recusou o token. Verifique HOME_ASSISTANT_TOKEN.")
                        if response.status_code == 404:
                            raise AlexaError("A ação notify.alexa_media não foi encontrada. Configure Alexa Media Player.")
                        if not 200 <= response.status_code < 300:
                            raise AlexaError("O Home Assistant não aceitou a fala. Verifique o dispositivo e a integração.")
                        sent += 1
                        delay = max(3.0, len(chunk.split()) * 0.48 + 1.5)
                        self.busy_until = time.monotonic() + delay
                        if index < len(chunks) - 1:
                            await asyncio.sleep(delay)
            except httpx.RequestError as exc:
                # Never echo URLs, credentials or raw remote error bodies to the browser.
                raise AlexaError("Não foi possível comunicar com o Home Assistant. "
                                 "Confira o endereço e a conexão de rede.") from exc
            except AlexaError as exc:
                if sent:
                    raise AlexaError(f"Somente {sent} parte(s) do texto foram enviadas. {exc}", exc.status_code) from exc
                raise
            self.last_text = normalized
            return {"status": "sent", "message": "Texto enviado à Alexa. A entrega depende da integração e do Echo.",
                    "chunks": len(chunks)}
