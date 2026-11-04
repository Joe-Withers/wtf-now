import runpy
import sys
from pathlib import Path

import pytest

from wtf_now.graph import is_blocked
from wtf_now.store import Store

SCRIPT = Path(__file__).parents[1] / "scripts" / "seed_example.py"


def seed(target: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "argv", ["seed_example.py", str(target)])
    runpy.run_path(str(SCRIPT), run_name="__main__")


def test_example_project_loads_cleanly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seed(tmp_path / "van", monkeypatch)

    project = Store(tmp_path / "van").project

    assert project.problems == []
    assert len(project.tasks) >= 30
    assert project.tasks["board-wire"].progress == 60
    assert is_blocked(project, "clad-walls")


def test_seeding_refuses_an_existing_project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seed(tmp_path / "van", monkeypatch)

    with pytest.raises(SystemExit, match="already has tasks"):
        seed(tmp_path / "van", monkeypatch)
