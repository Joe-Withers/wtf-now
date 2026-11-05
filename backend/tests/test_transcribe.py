from pathlib import Path

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from wtf_now.api import create_app
from wtf_now.store import Store
from wtf_now.transcribe import Transcriber, TranscriptionError


def transcriber(handler) -> Transcriber:
    return Transcriber("https://stt.test/v1/", "secret", "whisper", transport=httpx.MockTransport(handler))


def replies(request: httpx.Request) -> httpx.Response:
    assert request.url == "https://stt.test/v1/audio/transcriptions"
    assert request.headers["Authorization"] == "Bearer secret"
    assert b"whisper" in request.content and b"note.webm" in request.content
    return httpx.Response(200, json={"text": " Finished the ceiling panels. "})


def test_transcribes_audio() -> None:
    assert transcriber(replies).transcribe("audio/webm;codecs=opus", b"audio") == "Finished the ceiling panels."


@pytest.mark.parametrize(
    ("media_type", "data"), [("video/mp4", b"audio"), ("audio/webm", b""), ("audio/webm", b"x" * (25 * 1024 * 1024 + 1))]
)
def test_bad_audio_is_refused(media_type: str, data: bytes) -> None:
    with pytest.raises(TranscriptionError):
        transcriber(replies).transcribe(media_type, data)


def test_service_failure_is_reported_without_details() -> None:
    def failing(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="secret internals")

    with pytest.raises(TranscriptionError, match="^Transcription failed$"):
        transcriber(failing).transcribe("audio/webm", b"audio")


@pytest.fixture
def store(tmp_path: Path) -> Store:
    store = Store(tmp_path / "bundle")
    store.initialise()
    return store


def post_audio(client: TestClient):
    return client.post("/api/transcribe", files={"file": ("note.webm", b"audio", "audio/webm")})


def test_features_report_what_is_configured(store: Store) -> None:
    assert TestClient(create_app(store)).get("/api/features").json() == {"chat": False, "voice": False}
    assert TestClient(create_app(store, transcriber=transcriber(replies))).get("/api/features").json()["voice"] is True


def test_transcribe_route(store: Store) -> None:
    client = TestClient(create_app(store, transcriber=transcriber(replies)))

    assert post_audio(client).json() == {"text": "Finished the ceiling panels."}


def test_transcribe_route_without_a_provider(store: Store) -> None:
    assert post_audio(TestClient(create_app(store))).status_code == 503
