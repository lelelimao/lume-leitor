"""Google Translate TTS via gTTS; text is sent only on explicit voice selection."""
from io import BytesIO
from threading import BoundedSemaphore


class GoogleVoice:
    def __init__(self):
        self._gate = BoundedSemaphore(1)

    def synthesize(self, text: str) -> bytes:
        if not self._gate.acquire(blocking=False):
            raise RuntimeError("Uma fala Google já está sendo preparada. Aguarde.")
        try:
            from gtts import gTTS
            output = BytesIO()
            gTTS(text=text, lang="pt", tld="com.br", lang_check=False, timeout=(5, 20)).write_to_fp(output)
            return output.getvalue()
        finally:
            self._gate.release()
