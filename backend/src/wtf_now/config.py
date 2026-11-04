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
