"""Reads and writes Open Knowledge Format (OKF) v0.2 files.

Knows about concepts, log.md and index.md, and nothing about tasks.
"""

import os
import re
import tempfile
from dataclasses import dataclass, field
from datetime import date
from io import StringIO
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap
from ruamel.yaml.error import YAMLError

OKF_VERSION = "0.2"
RESERVED_FILENAMES = {"index.md", "log.md"}
LOG_TITLE = "# Project log"

_FRONTMATTER = re.compile(r"\A---\n(.*?\n)?---(?:\n|\Z)(.*)\Z", re.DOTALL)
_DATE_HEADING = re.compile(r"^## (\d{4}-\d{2}-\d{2})\s*$")
_LOG_ENTRY = re.compile(r"^[*-] (.*)$")


class ConceptError(Exception):
    """A file isn't a valid OKF concept."""


def _yaml() -> YAML:
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096
    yaml.indent(mapping=2, sequence=4, offset=2)
    return yaml


@dataclass
class Concept:
    path: str  # relative to the bundle root, with forward slashes
    frontmatter: CommentedMap = field(default_factory=CommentedMap)
    body: str = ""

    @property
    def id(self) -> str:
        return self.path.removesuffix(".md")

    @property
    def slug(self) -> str:
        return Path(self.path).stem

    @property
    def type(self) -> str:
        return str(self.frontmatter.get("type", ""))


def parse_concept(path: str, text: str) -> Concept:
    match = _FRONTMATTER.match(text.replace("\r\n", "\n"))
    if not match:
        raise ConceptError(f"{path}: no YAML frontmatter")
    try:
        frontmatter = _yaml().load(match[1] or "")
    except YAMLError as error:
        raise ConceptError(f"{path}: invalid YAML: {error}") from error
    if not isinstance(frontmatter, dict):
        raise ConceptError(f"{path}: frontmatter is not a mapping")
    if not frontmatter.get("type"):
        raise ConceptError(f"{path}: frontmatter has no type")
    return Concept(path, frontmatter, match[2])


def render_concept(concept: Concept) -> str:
    buffer = StringIO()
    _yaml().dump(concept.frontmatter, buffer)
    return f"---\n{buffer.getvalue()}---\n{concept.body}"


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as file:
            file.write(text)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def read_concepts(root: Path) -> tuple[list[Concept], list[ConceptError]]:
    """Reads every concept in a bundle, returning unreadable files as errors."""
    concepts: list[Concept] = []
    errors: list[ConceptError] = []
    for path in sorted(root.rglob("*.md")):
        relative = path.relative_to(root)
        if path.name in RESERVED_FILENAMES or relative.parts[0].startswith("."):
            continue
        try:
            concepts.append(parse_concept(relative.as_posix(), path.read_text(encoding="utf-8")))
        except (ConceptError, UnicodeDecodeError) as error:
            errors.append(ConceptError(str(error)))
    return concepts, errors


# log.md


@dataclass
class LogDay:
    day: date
    entries: list[str] = field(default_factory=list)


def parse_log(text: str) -> list[LogDay]:
    days: list[LogDay] = []
    for line in text.splitlines():
        if heading := _DATE_HEADING.match(line):
            try:
                days.append(LogDay(date.fromisoformat(heading[1])))
            except ValueError:
                continue
        elif days and (entry := _LOG_ENTRY.match(line)):
            days[-1].entries.append(entry[1])
    return days


def render_log_entry(label: str, text: str) -> str:
    return f"* **{label}**: {' '.join(text.split())}"


def add_log_entry(text: str, day: date, label: str, entry: str) -> str:
    """Adds an entry at the top of its day, creating the day's heading if needed."""
    line = render_log_entry(label, entry)
    heading = f"## {day.isoformat()}"
    lines = text.splitlines() if text.strip() else [LOG_TITLE, ""]
    if heading in lines:
        at = lines.index(heading) + 1
        lines[at:at] = [line]
    else:
        at = next((i for i, value in enumerate(lines) if _DATE_HEADING.match(value)), len(lines))
        lines[at:at] = [heading, line, ""]
    return "\n".join(lines).rstrip("\n") + "\n"


# index.md


def render_index(sections: dict[str, list[tuple[str, str, str]]]) -> str:
    """Renders the bundle root index from {section: [(title, path, description)]}."""
    lines = ["---", f'okf_version: "{OKF_VERSION}"', "---", ""]
    for section, entries in sections.items():
        if not entries:
            continue
        lines += [f"## {section}", ""]
        for title, path, description in entries:
            suffix = f" - {_one_line(description)}" if description else ""
            lines.append(f"* [{title}](/{path}){suffix}")
        lines.append("")
    return "\n".join(lines).rstrip("\n") + "\n"


def _one_line(text: Any) -> str:
    return " ".join(str(text).split())


# Sections of a concept's body


def get_section(body: str, heading: str) -> str:
    lines = body.splitlines()
    marker = f"## {heading}"
    if marker not in lines:
        return ""
    start = lines.index(marker) + 1
    end = next((i for i in range(start, len(lines)) if lines[i].startswith("## ")), len(lines))
    return "\n".join(lines[start:end]).strip()


def set_section(body: str, heading: str, text: str) -> str:
    """Replaces a section, or adds it at the top of the body."""
    marker = f"## {heading}"
    section = [marker, "", *text.strip().splitlines(), ""]
    lines = body.splitlines()
    if marker in lines:
        start = lines.index(marker)
        end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
        lines[start:end] = section
    else:
        lines = ["", *section, *lines]
    return "\n".join(lines).rstrip("\n") + "\n"
