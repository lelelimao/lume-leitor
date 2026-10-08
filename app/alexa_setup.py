"""Configuração local com descoberta e token mantido somente no servidor."""
import asyncio
from dataclasses import replace
from pathlib import Path
import re
from urllib.parse import urlsplit

from dotenv import set_key
import httpx

from .alexa import AlexaError
from .config import Settings


def connection_settings(settings: Settings, url: str, token: str, entity: str = ""):
    url = url.strip().rstrip("/")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise AlexaError("Use um endereço http:// ou https:// válido do Home Assistant, sem senha na URL.", 400)
    if any(c in url + token + entity for c in "\r\n\x00"):
        raise AlexaError("Os campos contêm caracteres inválidos.", 400)
    token = token.strip() or (settings.ha_token if url == settings.ha_url else "")
    if not token:
        raise AlexaError("Informe o token de longa duração do Home Assistant.", 400)
    if entity and not re.fullmatch(r"media_player\.[a-z0-9_]+", entity):
        raise AlexaError("Selecione uma entidade media_player válida.", 400)
    return replace(settings, ha_url=url, ha_token=token, alexa_entity=entity)


async def discover(settings: Settings, transport=None):
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False, trust_env=False, transport=transport,
                                     headers={"Authorization": f"Bearer {settings.ha_token}"}) as client:
            states, services = await asyncio.gather(client.get(f"{settings.ha_url}/api/states"),
                                                   client.get(f"{settings.ha_url}/api/services"))
        for response in (states, services):
            if response.status_code in (401, 403):
                raise AlexaError("Token recusado. Crie um token no perfil do Home Assistant e tente novamente.", 400)
            if response.status_code != 200:
                raise AlexaError("O endereço não respondeu como Home Assistant. Confira a URL e a porta.", 400)
        states_data, services_data = states.json(), services.json()
        available = any(item.get("domain") == "notify" and "alexa_media" in item.get("services", {})
                        for item in services_data)
        if not available:
            raise AlexaError("Home Assistant conectado, mas notify.alexa_media não existe. Instale e configure Alexa Media Player primeiro.", 400)
        devices = [{"entity_id": item["entity_id"], "name": item.get("attributes", {}).get("friendly_name", item["entity_id"]),
                    "state": item.get("state", "unknown")}
                   for item in states_data if str(item.get("entity_id", "")).startswith("media_player.")]
        return {"devices": devices, "message": "Conectado. Escolha a entidade do seu Echo e salve. A lista inclui todos os players; selecione o da Alexa."}
    except httpx.RequestError as exc:
        raise AlexaError("Não foi possível conectar. Confira se o Home Assistant está ligado e acessível neste computador.") from exc
    except (ValueError, TypeError, AttributeError, KeyError) as exc:
        raise AlexaError("O servidor retornou uma resposta inesperada. Confira o endereço do Home Assistant.") from exc


def save_settings(path: Path, settings: Settings):
    """Use dotenv quoting to avoid newline injection; set_key uses atomic replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    for key, value in (("HOME_ASSISTANT_URL", settings.ha_url),
                       ("HOME_ASSISTANT_TOKEN", settings.ha_token), ("ALEXA_ENTITY_ID", settings.alexa_entity)):
        set_key(str(path), key, value, quote_mode="always")
