"""Speech to text, through any service with an OpenAI-style transcription endpoint."""

import os

import httpx

from .config import load_env

MEDIA_TYPES = {"audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav"}
MAX_BYTES = 25 * 1024 * 1024
TIMEOUT_SECONDS = 120


class TranscriptionError(Exception):
    pass


class Transcriber:
    def __init__(self, base_url: str, api_key: str, model: str, transport: httpx.BaseTransport | None = None) -> None:
        self.model = model
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=TIMEOUT_SECONDS,
            transport=transport,
        )

    def transcribe(self, media_type: str, data: bytes) -> str:
        base_type = media_type.split(";")[0].strip()
        if base_type not in MEDIA_TYPES:
            raise TranscriptionError("That audio format isn't supported")
        if not data or len(data) > MAX_BYTES:
            raise TranscriptionError("That recording is empty or too long")
        try:
            response = self._client.post(
                "/audio/transcriptions",
                files={"file": (f"note.{MEDIA_TYPES[base_type]}", data, base_type)},
                data={"model": self.model},
            )
            response.raise_for_status()
            return str(response.json()["text"]).strip()
        except (httpx.HTTPError, KeyError, ValueError) as error:
            raise TranscriptionError("Transcription failed") from error


def load_transcriber() -> Transcriber | None:
    """A transcriber if STT_BASE_URL, STT_API_KEY and STT_MODEL are all set."""
    load_env()
    values = [os.environ.get(name, "").strip() for name in ("STT_BASE_URL", "STT_API_KEY", "STT_MODEL")]
    return Transcriber(*values) if all(values) else None
