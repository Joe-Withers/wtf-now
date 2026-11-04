from datetime import date
from pathlib import Path

import pytest

from wtf_now.bundle import (
    Concept,
    ConceptError,
    add_log_entry,
    parse_concept,
    parse_log,
    read_concepts,
    render_concept,
    render_index,
    write_text_atomic,
)

CONCEPT = """---
type: Task
title: "Fit the battery" # quoted, with a comment
zone: rear-left
a_producer_extension:
  nested:
    - one
    - two
depends_on:
  - task: wiring
    strength: hard
generated:
  by: human:owner
  at: 2026-11-04T10:00:00+00:00
---

## Current state

Bolted down.
"""


def test_round_trip_leaves_the_file_unchanged() -> None:
    assert render_concept(parse_concept("tasks/fit-battery.md", CONCEPT)) == CONCEPT


def test_changing_one_key_keeps_the_others() -> None:
    concept = parse_concept("tasks/fit-battery.md", CONCEPT)
    concept.frontmatter["zone"] = "rear-right"

    rendered = render_concept(concept)

    assert rendered == CONCEPT.replace("zone: rear-left", "zone: rear-right")


def test_concept_identity_comes_from_the_path() -> None:
    concept = parse_concept("tasks/fit-battery.md", CONCEPT)

    assert (concept.id, concept.slug, concept.type) == ("tasks/fit-battery", "fit-battery", "Task")


@pytest.mark.parametrize(
    "text",
    [
        "no frontmatter",
        "---\ntitle: no type\n---\n",
        "---\ntype: ''\n---\n",
        "---\n- a\n- list\n---\n",
        "---\ntype: [unclosed\n---\n",
    ],
)
def test_invalid_concepts_are_rejected(text: str) -> None:
    with pytest.raises(ConceptError):
        parse_concept("tasks/bad.md", text)


def test_read_concepts_skips_reserved_files_and_reports_bad_ones(tmp_path: Path) -> None:
    write_text_atomic(tmp_path / "index.md", "not a concept")
    write_text_atomic(tmp_path / "log.md", "not a concept")
    write_text_atomic(tmp_path / "tasks" / "good.md", "---\ntype: Task\n---\n")
    write_text_atomic(tmp_path / "tasks" / "bad.md", "nope")
    write_text_atomic(tmp_path / ".git" / "note.md", "ignored")

    concepts, errors = read_concepts(tmp_path)

    assert [concept.path for concept in concepts] == ["tasks/good.md"]
    assert len(errors) == 1 and "tasks/bad.md" in str(errors[0])


def test_write_text_atomic_leaves_no_temporary_files(tmp_path: Path) -> None:
    write_text_atomic(tmp_path / "a" / "file.md", "hello")

    assert [path.name for path in (tmp_path / "a").iterdir()] == ["file.md"]


def test_log_entries_group_by_day_newest_first() -> None:
    text = add_log_entry("", date(2026, 11, 3), "Progress", "First")
    text = add_log_entry(text, date(2026, 11, 4), "Progress", "Second")
    text = add_log_entry(text, date(2026, 11, 4), "Note", "Third")

    days = parse_log(text)

    assert [day.day for day in days] == [date(2026, 11, 4), date(2026, 11, 3)]
    assert days[0].entries == ["**Note**: Third", "**Progress**: Second"]
    assert days[1].entries == ["**Progress**: First"]


def test_log_entries_cannot_inject_structure() -> None:
    text = add_log_entry("", date(2026, 11, 4), "Note", "line one\n## 2020-01-01\nline two")

    days = parse_log(text)

    assert len(days) == 1
    assert days[0].entries == ["**Note**: line one ## 2020-01-01 line two"]


def test_parse_log_accepts_hyphen_bullets_and_ignores_bad_dates() -> None:
    days = parse_log("# Log\n\n## 2026-13-45\n- lost\n\n## 2026-11-04\n- kept\n")

    assert [(day.day, day.entries) for day in days] == [(date(2026, 11, 4), ["kept"])]


def test_render_index() -> None:
    text = render_index(
        {
            "Tasks": [("Fit battery", "tasks/fit-battery.md", "Bolt\nit down")],
            "Notes": [],
        }
    )

    assert text == '---\nokf_version: "0.2"\n---\n\n## Tasks\n\n* [Fit battery](/tasks/fit-battery.md) - Bolt it down\n'


def test_rendered_concept_can_be_built_from_scratch() -> None:
    concept = Concept("notes/a.md", parse_concept("x", "---\ntype: Note\n---\n").frontmatter, "Body\n")

    assert render_concept(concept) == "---\ntype: Note\n---\nBody\n"
