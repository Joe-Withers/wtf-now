import base64
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from wtf_now.api import create_app
from wtf_now.chat import Chat, SessionStore
from wtf_now.photos import MAX_BYTES, LocalPhotos, S3Photos
from wtf_now.proposals import ProposalStore
from wtf_now.store import Op, Store
from wtf_now.views import NotFound

from .test_agent import ScriptedModel, call, text

NOW = datetime(2026, 11, 4, tzinfo=UTC)
PNG = b"\x89PNG fake"


@pytest.fixture
def store(tmp_path: Path) -> Store:
    store = Store(tmp_path / "bundle", clock=lambda: NOW)
    store.initialise()
    store.apply([Op("create_task", {"title": "Wire board"})])
    return store


@pytest.fixture
def client(tmp_path: Path, store: Store) -> TestClient:
    return TestClient(create_app(store, clock=lambda: NOW, photos=LocalPhotos(tmp_path / "photos")))


def upload(client: TestClient, path: str, content: bytes = PNG, media_type: str = "image/png", **data):
    return client.post(path, files={"file": ("photo.png", content, media_type)}, data=data)


def test_photo_on_a_task_round_trips_and_stays_out_of_git(client: TestClient, store: Store) -> None:
    response = upload(client, "/api/tasks/wire-board/photos", caption="Wiring so far")
    assert response.status_code == 201

    [photo] = client.get("/api/tasks/wire-board").json()["photos"]

    assert photo["caption"] == "Wiring so far"
    served = client.get(f"/api/photos/{photo['key']}")
    assert served.content == PNG
    assert served.headers["content-type"] == "image/png"
    assert photo["key"] not in store._git("ls-files").stdout


def test_attaching_a_photo_can_be_undone(client: TestClient) -> None:
    change = upload(client, "/api/tasks/wire-board/photos").json()["change"]

    client.post(f"/api/changes/{change['id']}/undo")

    assert client.get("/api/tasks/wire-board").json()["photos"] == []


def test_only_images_are_accepted(client: TestClient) -> None:
    assert upload(client, "/api/photos", media_type="text/html").status_code == 422
    assert upload(client, "/api/photos", b"").status_code == 422


def test_oversized_photos_are_refused(client: TestClient) -> None:
    assert upload(client, "/api/photos", b"x" * (MAX_BYTES + 1)).status_code == 422


@pytest.mark.parametrize("key", ["..%2f..%2fsecret.png", "nothing.png", "a" * 32 + ".exe"])
def test_bad_keys_are_not_served(client: TestClient, tmp_path: Path, key: str) -> None:
    (tmp_path / "secret.png").write_bytes(b"private")

    response = client.get(f"/api/photos/{key}")

    assert response.status_code == 404
    assert b"private" not in response.content


def test_photo_routes_say_when_storage_is_missing(store: Store) -> None:
    client = TestClient(create_app(store))

    assert upload(client, "/api/photos").status_code == 503


class FakeS3:
    class exceptions:
        class NoSuchKey(Exception):
            pass

    def __init__(self) -> None:
        self.objects: dict[str, dict] = {}

    def put_object(self, **kwargs) -> None:
        self.objects[kwargs["Key"]] = kwargs

    def get_object(self, Bucket: str, Key: str) -> dict:
        if Key not in self.objects:
            raise self.exceptions.NoSuchKey()

        class Body:
            def read(inner) -> bytes:
                return self.objects[Key]["Body"]

        return {"Body": Body()}


def test_s3_store_sends_the_right_requests() -> None:
    s3 = FakeS3()
    photos = S3Photos(s3, "bucket")
    key = "a" * 32 + ".jpg"

    photos.put(key, b"data")

    assert s3.objects[key]["ContentType"] == "image/jpeg"
    assert s3.objects[key]["Bucket"] == "bucket"
    assert photos.get(key) == b"data"


def test_s3_missing_photo_is_not_found() -> None:
    with pytest.raises(NotFound):
        S3Photos(FakeS3(), "bucket").get("b" * 32 + ".jpg")


def test_ai_sees_a_photo_once_and_can_attach_it(store: Store, tmp_path: Path) -> None:
    photos = LocalPhotos(tmp_path / "photos")
    key = "c" * 32 + ".png"
    photos.put(key, PNG)
    model = ScriptedModel([call("attach_photo", slug="wire-board", key=key, caption="Fuse block")], [text("Attached.")], [text("Later.")])
    chat = Chat(model, store, SessionStore(tmp_path / "s", lambda: NOW), ProposalStore(tmp_path / "p", store), lambda: NOW)
    session = chat.sessions.create()

    list(chat.send(session.id, "Here's the board", [(key, PNG)]))

    first = model.seen[0][0]["content"]
    assert first[0]["source"]["data"] == base64.b64encode(PNG).decode()
    assert key in first[-1]["text"]
    assert store.project.concepts["tasks/wire-board.md"].frontmatter["photos"][0]["key"] == key

    list(chat.send(session.id, "What next?"))

    assert "image" not in str(model.seen[2][0])
    assert PNG.decode("latin1") not in (tmp_path / "s" / f"{session.id}.json").read_text()
    assert chat.sessions.get(session.id).display[0]["photos"] == [key]
