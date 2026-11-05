"""Settings from the environment, with .env at the repo root as a fallback."""

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[3]


def load_env() -> None:
    load_dotenv(REPO_ROOT / ".env")


def data_path(name: str, default: str) -> Path:
    """A path from the environment. Relative paths are relative to the repo root."""
    load_env()
    return (REPO_ROOT / os.environ.get(name, default).strip()).resolve()


def bundle_path() -> Path:
    return data_path("BUNDLE_PATH", "data/bundle")


def app_data_path() -> Path:
    return data_path("APP_DATA_PATH", "data/app")


def bundle_remote() -> str | None:
    load_env()
    return os.environ.get("BUNDLE_REMOTE", "").strip() or None


def web_root() -> Path:
    """The built frontend."""
    return data_path("WEB_ROOT", "frontend/dist")


def photo_store():
    """S3-compatible storage if it's configured, otherwise a local folder."""
    from .photos import LocalPhotos, S3Photos

    load_env()
    bucket = os.environ.get("S3_BUCKET", "").strip()
    if not bucket:
        return LocalPhotos(app_data_path() / "photos")

    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT", "").strip() or None,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY", "").strip(),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY", "").strip(),
    )
    return S3Photos(client, bucket)
