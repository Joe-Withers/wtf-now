"""The single write path. The AI tools and the REST API both go through here.

Each call to `apply` is one transaction: its operations run against a copy,
the result is validated, and only then is anything written. Every change is
a git commit in the bundle, which is what makes undo work.
"""

import copy
import re
import subprocess
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ruamel.yaml.comments import CommentedMap

from .bundle import (
    Concept,
    ConceptError,
    LogDay,
    add_log_entry,
    parse_concept,
    parse_log,
    read_concepts,
    render_concept,
    render_index,
    set_section,
    write_text_atomic,
)
from .project import (
    KINDS,
    LEAF_ONLY_FIELDS,
    NOTE_DIR,
    STATES,
    STRENGTHS,
    TASK_DIR,
    Project,
    build_project,
    is_valid_slug,
)

OWNER = "human:owner"
CURRENT_STATE = "Current state"
LOG_FILE = "log.md"
INDEX_FILE = "index.md"
GENERATED_FILES = (LOG_FILE, INDEX_FILE)


class ChangeRejected(Exception):
    """A change was invalid. Nothing was written."""


class UndoConflict(Exception):
    """A change can't be undone because something newer touched the same files."""


@dataclass(frozen=True)
class Op:
    name: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Change:
    id: str
    summary: str
    at: str


def _as_number(name: str, value: Any) -> float | int | None:
    """Accepts numbers sent as strings, which models sometimes do."""
    if value is None or (isinstance(value, int | float) and not isinstance(value, bool)):
        return value
    try:
        return float(str(value).strip()) if isinstance(value, str) else _reject_number(name, value)
    except ValueError:
        return _reject_number(name, value)


def _reject_number(name: str, value: Any) -> None:
    raise ChangeRejected(f"{name} must be a number, not {value!r}")


def _as_bool(name: str, value: Any) -> bool | None:
    if value is None or isinstance(value, bool):
        return value
    if str(value).strip().lower() in ("true", "false"):
        return str(value).strip().lower() == "true"
    raise ChangeRejected(f"{name} must be true or false, not {value!r}")


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60].rstrip("-") or "untitled"


class Transaction:
    """Operations against a private copy of the bundle's concepts."""

    OPERATIONS = (
        "create_task",
        "update_task",
        "move_task",
        "delete_task",
        "add_dependency",
        "remove_dependency",
        "set_progress",
        "set_state",
        "update_current_state",
        "write_note",
        "verify_note",
    )

    def __init__(self, concepts: dict[str, Concept], now: datetime, actor: str) -> None:
        self.concepts = copy.deepcopy(concepts)
        self.now = now
        self.actor = actor
        self.log: list[tuple[str, str]] = []

    def run(self, op: Op) -> Any:
        if op.name not in self.OPERATIONS:
            raise ChangeRejected(f"Unknown operation: {op.name}")
        try:
            return getattr(self, op.name)(**op.args)
        except TypeError as error:
            raise ChangeRejected(f"Bad arguments for {op.name}: {error}") from error

    def _project(self) -> Project:
        return build_project(self.concepts.values())

    def _task(self, slug: str) -> Concept:
        concept = self.concepts.get(f"{TASK_DIR}{slug}.md")
        if concept is None:
            raise ChangeRejected(f"No task called {slug!r}")
        return concept

    def _leaf(self, slug: str) -> Concept:
        concept = self._task(slug)
        if not self._project().is_leaf(slug):
            raise ChangeRejected(f"{slug!r} has subtasks, so its progress comes from them")
        return concept

    def _unique_slug(self, directory: str, wanted: str) -> str:
        slug, number = wanted, 2
        while f"{directory}{slug}.md" in self.concepts:
            slug, number = f"{wanted}-{number}", number + 1
        return slug

    def _link(self, concept: Concept) -> str:
        return f"[{concept.frontmatter.get('title', concept.slug)}](/{concept.path})"

    def _record(self, label: str, text: str) -> None:
        self.log.append((label, text))

    def create_task(
        self,
        title: str,
        parent: str | None = None,
        kind: str = "build",
        slug: str | None = None,
        description: str = "",
        effort_hours: float | None = None,
        zone: str | None = None,
        closes_zone: str | None = None,
        needs_helper: bool = False,
        cost: float | None = None,
        depends_on: list[dict[str, str]] | None = None,
    ) -> str:
        if kind not in KINDS:
            raise ChangeRejected(f"kind must be one of {', '.join(KINDS)}")
        if slug is not None and not is_valid_slug(slug):
            raise ChangeRejected(f"{slug!r} isn't a valid slug")
        if parent is not None:
            self._clear_leaf_fields(self._task(parent))

        effort_hours = _as_number("effort_hours", effort_hours)
        cost = _as_number("cost", cost)
        needs_helper = bool(_as_bool("needs_helper", needs_helper))
        slug = self._unique_slug(TASK_DIR, slug or slugify(title))
        data = CommentedMap(type="Task", title=title)
        optional = {
            "description": description or None,
            "parent": parent,
            "effort_hours": effort_hours,
            "zone": zone,
            "closes_zone": closes_zone,
            "needs_helper": needs_helper or None,
            "cost": cost,
        }
        data["kind"] = kind
        data["state"] = "todo"
        data.update({key: value for key, value in optional.items() if value is not None})
        concept = Concept(f"{TASK_DIR}{slug}.md", data, "")
        self.concepts[concept.path] = concept
        # Targets may be created later in this transaction; validation catches any that never are.
        for dependency in depends_on or []:
            strength = dependency.get("strength", "hard")
            if strength not in STRENGTHS:
                raise ChangeRejected(f"strength must be one of {', '.join(STRENGTHS)}")
            data.setdefault("depends_on", []).append(CommentedMap(task=dependency["task"], strength=strength))
        self._record("Added", self._link(concept))
        return slug

    def _clear_leaf_fields(self, concept: Concept) -> None:
        for key in LEAF_ONLY_FIELDS:
            concept.frontmatter.pop(key, None)

    def update_task(
        self,
        slug: str,
        reason: str = "",
        **fields: Any,
    ) -> None:
        concept = self._task(slug)
        allowed = {"title", "description", "kind", "zone", "closes_zone", "effort_hours", "needs_helper", "cost"}
        if unknown := set(fields) - allowed:
            raise ChangeRejected(f"Can't update {', '.join(sorted(unknown))}")
        if "kind" in fields and fields["kind"] not in KINDS:
            raise ChangeRejected(f"kind must be one of {', '.join(KINDS)}")
        for key in ("effort_hours", "cost"):
            if key in fields:
                fields[key] = _as_number(key, fields[key])
        if "needs_helper" in fields:
            fields["needs_helper"] = _as_bool("needs_helper", fields["needs_helper"])
        for key, value in fields.items():
            if value is None:
                concept.frontmatter.pop(key, None)
            else:
                concept.frontmatter[key] = value
        self._record("Updated", f"{self._link(concept)}{f': {reason}' if reason else ''}")

    def move_task(self, slug: str, parent: str | None = None) -> None:
        concept = self._task(slug)
        if parent is None:
            concept.frontmatter.pop("parent", None)
        else:
            self._clear_leaf_fields(self._task(parent))
            concept.frontmatter["parent"] = parent
        self._record("Moved", f"{self._link(concept)} to {parent or 'the top level'}")

    def delete_task(self, slug: str) -> None:
        concept = self._task(slug)
        project = self._project()
        if not project.is_leaf(slug):
            raise ChangeRejected(f"{slug!r} has subtasks. Delete or move those first")
        dependents = [task.slug for task in project.tasks.values() if any(d.task == slug for d in task.depends_on)]
        if dependents:
            raise ChangeRejected(f"{', '.join(dependents)} depend on {slug!r}. Remove those dependencies first")
        del self.concepts[concept.path]
        self._record("Removed", str(concept.frontmatter.get("title", slug)))

    def add_dependency(self, task: str, depends_on: str, strength: str = "hard") -> None:
        if strength not in STRENGTHS:
            raise ChangeRejected(f"strength must be one of {', '.join(STRENGTHS)}")
        concept = self._task(task)
        target = self._task(depends_on)
        entries = concept.frontmatter.setdefault("depends_on", [])
        for entry in entries:
            if entry["task"] == depends_on:
                entry["strength"] = strength
                break
        else:
            entries.append(CommentedMap(task=depends_on, strength=strength))
        self._record("Dependency", f"{self._link(concept)} needs {self._link(target)} ({strength})")

    def remove_dependency(self, task: str, depends_on: str) -> None:
        concept = self._task(task)
        entries = concept.frontmatter.get("depends_on") or []
        remaining = [entry for entry in entries if entry["task"] != depends_on]
        if len(remaining) == len(entries):
            raise ChangeRejected(f"{task!r} doesn't depend on {depends_on!r}")
        if remaining:
            concept.frontmatter["depends_on"] = remaining
        else:
            del concept.frontmatter["depends_on"]
        self._record("Dependency", f"{self._link(concept)} no longer needs {depends_on}")

    def set_progress(self, slug: str, progress: float, reason: str) -> None:
        concept = self._leaf(slug)
        progress = _as_number("progress", progress)
        if progress is None or not 0 <= progress <= 100:
            raise ChangeRejected("progress must be between 0 and 100")
        if not reason.strip():
            raise ChangeRejected("A progress change needs a reason")
        data = concept.frontmatter
        data["progress"] = progress
        data["progress_reason"] = reason
        data["state"] = "done" if progress == 100 else "doing" if progress > 0 else "todo"
        self._record("Progress", f"{self._link(concept)} is at {progress:g}%: {reason}")

    def set_state(self, slug: str, state: str, reason: str = "") -> None:
        concept = self._leaf(slug)
        if state not in STATES:
            raise ChangeRejected(f"state must be one of {', '.join(STATES)}")
        data = concept.frontmatter
        data["state"] = state
        if state != "doing":
            data.pop("progress", None)
            data.pop("progress_reason", None)
        if reason:
            data["progress_reason"] = reason
        label = {"todo": "Reopened", "doing": "Started", "done": "Finished"}[state]
        if data.get("kind") == "purchase":
            label = {"todo": "To order", "doing": "Ordered", "done": "Arrived"}[state]
        self._record(label, f"{self._link(concept)}{f': {reason}' if reason else ''}")

    def update_current_state(self, slug: str, text: str) -> None:
        concept = self._task(slug)
        if not text.strip():
            raise ChangeRejected("Current state can't be empty")
        concept.body = set_section(concept.body, CURRENT_STATE, text)
        self._record("Current state", f"{self._link(concept)}: {text}")

    def write_note(
        self,
        title: str,
        body: str,
        slug: str | None = None,
        type: str = "Note",
        description: str = "",
        stale_after: str | None = None,
    ) -> str:
        if slug is not None and not is_valid_slug(slug):
            raise ChangeRejected(f"{slug!r} isn't a valid slug")
        if type == "Task":
            raise ChangeRejected("Notes can't have type Task")
        if stale_after is not None:
            self._check_timestamp(stale_after)
        slug = slug or self._unique_slug(NOTE_DIR, slugify(title))
        path = f"{NOTE_DIR}{slug}.md"
        existing = self.concepts.get(path)
        concept = existing or Concept(path, CommentedMap(), "")
        data = concept.frontmatter
        data["type"] = type
        data["title"] = title
        if description:
            data["description"] = description
        data["generated"] = CommentedMap(by=self.actor, at=self.now.isoformat())
        data.pop("verified", None)  # the text changed, so it needs confirming again
        if stale_after is None:
            data.pop("stale_after", None)
        else:
            data["stale_after"] = stale_after
        concept.body = body if body.endswith("\n") else f"{body}\n"
        self.concepts[path] = concept
        self._record("Note", self._link(concept))
        return slug

    def _check_timestamp(self, value: str) -> None:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as error:
            raise ChangeRejected(f"{value!r} isn't an ISO 8601 timestamp") from error
        if parsed.tzinfo is None:
            raise ChangeRejected(f"{value!r} needs a UTC offset")

    def verify_note(self, slug: str) -> None:
        concept = self.concepts.get(f"{NOTE_DIR}{slug}.md")
        if concept is None:
            raise ChangeRejected(f"No note called {slug!r}")
        entries = concept.frontmatter.setdefault("verified", [])
        entries.append(CommentedMap(by=OWNER, at=self.now.isoformat()))
        self._record("Verified", self._link(concept))


class Store:
    def __init__(self, root: Path, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.root = root
        self._clock = clock
        self._lock = threading.RLock()
        self._signature: tuple | None = None
        self._project = Project()

    def initialise(self) -> None:
        """Creates the bundle and its git repo if they don't exist yet."""
        with self._lock:
            self.root.mkdir(parents=True, exist_ok=True)
            if not (self.root / ".git").exists():
                self._git("init", "-q", "-b", "main")
                self._write_index(self.project)
                self._git("add", "-A")
                self._git("commit", "-q", "-m", "Create project")

    def _git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        identity = ("-c", "user.name=wtf-now", "-c", "user.email=wtf-now@localhost", "-c", "commit.gpgsign=false")
        return subprocess.run(
            ("git", *identity, *args), cwd=self.root, check=check, capture_output=True, text=True
        )

    def _current_signature(self) -> tuple:
        files = (path for path in self.root.rglob("*.md") if ".git" not in path.relative_to(self.root).parts)
        return tuple(sorted((str(path), path.stat().st_mtime_ns, path.stat().st_size) for path in files))

    @property
    def project(self) -> Project:
        """The current project, reloaded if the files changed, for example by hand."""
        with self._lock:
            signature = self._current_signature()
            if signature != self._signature:
                self._project = build_project(*read_concepts(self.root))
                self._signature = signature
            return self._project

    def log(self) -> list[LogDay]:
        path = self.root / LOG_FILE
        return parse_log(path.read_text(encoding="utf-8")) if path.exists() else []

    def _validated(self, ops: list[Op], actor: str) -> tuple[Transaction, list[Any]]:
        current = self.project
        transaction = Transaction(current.concepts, self._clock(), actor)
        results = [transaction.run(op) for op in ops]
        candidate = build_project(transaction.concepts.values())
        existing = set(current.problems)
        new = [problem.message for problem in candidate.problems if problem not in existing]
        if new:
            raise ChangeRejected("; ".join(new))
        return transaction, results

    def check(self, ops: list[Op], actor: str = OWNER) -> None:
        """Raises ChangeRejected if these operations wouldn't apply. Writes nothing."""
        with self._lock:
            self._validated(ops, actor)

    def apply(self, ops: list[Op], actor: str = OWNER, summary: str = "") -> tuple[Change, list[Any]]:
        with self._lock:
            transaction, results = self._validated(ops, actor)
            self._commit_hand_edits()
            before = self.project.concepts

            for path in before.keys() - transaction.concepts.keys():
                (self.root / path).unlink()
            for path, concept in transaction.concepts.items():
                original = before.get(path)
                if original is None or render_concept(original) != render_concept(concept):
                    write_text_atomic(self.root / path, render_concept(concept))

            text = self._read(LOG_FILE)
            for label, entry in transaction.log:
                text = add_log_entry(text, transaction.now.date(), label, entry)
            write_text_atomic(self.root / LOG_FILE, text)

            self._write_index(build_project(transaction.concepts.values()))
            message = summary or re.sub(r"\[([^]]*)\]\([^)]*\)", r"\1", transaction.log[0][1]) if transaction.log else summary
            return self._commit(message or "Update project", transaction.now), results

    def _read(self, name: str) -> str:
        path = self.root / name
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def _write_index(self, project: Project) -> None:
        def entries(concepts: list[Concept]) -> list[tuple[str, str, str]]:
            return [
                (str(c.frontmatter.get("title", c.slug)), c.path, str(c.frontmatter.get("description", "")))
                for c in concepts
            ]

        by_directory = {"Tasks": [], "Notes": [], "Layouts": []}
        for concept in project.concepts.values():
            directory = concept.path.split("/")[0]
            section = {"tasks": "Tasks", "notes": "Notes", "layouts": "Layouts"}.get(directory)
            if section:
                by_directory[section].append(concept)
        sections = {name: entries(concepts) for name, concepts in by_directory.items()}
        write_text_atomic(self.root / INDEX_FILE, render_index(sections))

    def _commit_hand_edits(self) -> None:
        if self._git("status", "--porcelain").stdout.strip():
            self._git("add", "-A")
            self._git("commit", "-q", "-m", "Hand edits")

    def _commit(self, message: str, at: datetime) -> Change:
        self._git("add", "-A")
        self._git("commit", "-q", "-m", message)
        self._signature = None
        return Change(self._git("rev-parse", "HEAD").stdout.strip(), message, at.isoformat())

    def undo(self, change_id: str) -> Change:
        """Restores the files a change touched, unless something newer has changed them."""
        with self._lock:
            self._commit_hand_edits()
            if self._git("cat-file", "-e", f"{change_id}^{{commit}}", check=False).returncode != 0:
                raise UndoConflict("That change doesn't exist")
            changed = self._git("diff", "--name-only", f"{change_id}^", change_id).stdout.split("\n")
            paths = [path for path in changed if path and path not in GENERATED_FILES]
            if not paths:
                raise UndoConflict("That change has nothing to undo")
            newer = self._git("log", "--format=%H", f"{change_id}..HEAD", "--", *paths).stdout.strip()
            if newer:
                raise UndoConflict("Something newer changed the same files")

            existing = set(self.project.problems)
            restored: dict[str, str | None] = {}
            for path in paths:
                show = self._git("show", f"{change_id}^:{path}", check=False)
                restored[path] = show.stdout if show.returncode == 0 else None

            concepts = dict(self.project.concepts)
            for path, text in restored.items():
                if text is None:
                    concepts.pop(path, None)
                else:
                    try:
                        concepts[path] = parse_concept(path, text)
                    except ConceptError:
                        pass
            candidate = build_project(concepts.values())
            new = [problem.message for problem in candidate.problems if problem not in existing]
            if new:
                raise UndoConflict("; ".join(new))

            for path, text in restored.items():
                if text is None:
                    (self.root / path).unlink(missing_ok=True)
                else:
                    write_text_atomic(self.root / path, text)

            now = self._clock()
            summary = self._git("log", "-1", "--format=%s", change_id).stdout.strip()
            write_text_atomic(self.root / LOG_FILE, add_log_entry(self._read(LOG_FILE), now.date(), "Undone", summary))
            self._write_index(candidate)
            return self._commit(f"Undo: {summary}", now)
