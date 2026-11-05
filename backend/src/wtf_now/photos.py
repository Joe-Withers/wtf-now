"""Photo storage. Photos are too big for git, so tasks only hold their keys."""

import re
import uuid
from pathlib import Path
from typing import Any, Protocol

from .views import NotFound

MEDIA_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 15 * 1024 * 1024
_KEY = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp)$")


class InvalidPhoto(Exception):
    pass


def new_key(media_type: str) -> str:
    if media_type not in MEDIA_TYPES:
        raise InvalidPhoto("Photos must be JPEG, PNG or WebP")
    return f"{uuid.uuid4().hex}.{MEDIA_TYPES[media_type]}"


def media_type_of(key: str) -> str:
    return next(media for media, extension in MEDIA_TYPES.items() if key.endswith(f".{extension}"))


def _check_key(key: str) -> None:
    if not _KEY.match(key):
        raise NotFound("No such photo")


class PhotoStore(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes: ...


class LocalPhotos:
    """For development. Unlike S3Photos, these aren't backed up."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def put(self, key: str, data: bytes) -> None:
        _check_key(key)
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / key).write_bytes(data)

    def get(self, key: str) -> bytes:
        _check_key(key)
        path = self.root / key
        if not path.exists():
            raise NotFound("No such photo")
        return path.read_bytes()


class S3Photos:
    """Any S3-compatible object store, such as Cloudflare R2 or Backblaze B2."""

    def __init__(self, client: Any, bucket: str) -> None:
        self.client = client
        self.bucket = bucket

    def put(self, key: str, data: bytes) -> None:
        _check_key(key)
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=media_type_of(key))

    def get(self, key: str) -> bytes:
        _check_key(key)
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey as error:
            raise NotFound("No such photo") from error


def store_photo(photos: PhotoStore, media_type: str, data: bytes) -> str:
    if len(data) > MAX_BYTES:
        raise InvalidPhoto("That photo is too big (the limit is 15MB)")
    if not data:
        raise InvalidPhoto("That photo is empty")
    key = new_key(media_type)
    photos.put(key, data)
    return key
