from datetime import UTC, datetime
from pathlib import Path

import pytest

from wtf_now.bundle import get_section, set_section
from wtf_now.graph import is_blocked
from wtf_now.store import ChangeRejected, Op, Store, UndoConflict, slugify


@pytest.fixture
def store(tmp_path: Path) -> Store:
    store = Store(tmp_path / "bundle", clock=lambda: datetime(2026, 11, 4, 12, 0, tzinfo=UTC))
    store.initialise()
    return store


def task(store: Store, title: str, **args) -> str:
    _, results = store.apply([Op("create_task", {"title": title, **args})])
    return results[0]


def commits(store: Store) -> int:
    return int(store._git("rev-list", "--count", "HEAD").stdout)


def test_initialise_creates_a_repo_and_index(store: Store) -> None:
    assert (store.root / ".git").exists()
    assert (store.root / "index.md").read_text().startswith('---\nokf_version: "0.2"')
    assert commits(store) == 1


def test_initialise_twice_is_harmless(store: Store) -> None:
    store.initialise()

    assert commits(store) == 1


def test_create_task_writes_a_file_commits_and_logs(store: Store) -> None:
    slug = task(store, "Fit the Battery!", kind="build", effort_hours=2)

    assert slug == "fit-the-battery"
    assert store.project.tasks[slug].effort_hours == 2
    assert "Fit the Battery!" in (store.root / "index.md").read_text()
    assert "**Added**" in (store.root / "log.md").read_text()
    assert commits(store) == 2


def test_duplicate_titles_get_unique_slugs(store: Store) -> None:
    assert [task(store, "Same"), task(store, "Same")] == ["same", "same-2"]


def test_set_progress_moves_state_and_logs_the_reason(store: Store) -> None:
    slug = task(store, "Wire board")

    store.apply([Op("set_progress", {"slug": slug, "progress": 40, "reason": "Crimped the cables"})])

    assert store.project.tasks[slug].state == "doing"
    assert store.project.tasks[slug].progress == 40
    assert "Crimped the cables" in (store.root / "log.md").read_text()


def test_progress_of_100_finishes_the_task(store: Store) -> None:
    slug = task(store, "Wire board")

    store.apply([Op("set_progress", {"slug": slug, "progress": 100, "reason": "All connected"})])

    assert store.project.tasks[slug].state == "done"


@pytest.mark.parametrize("args", [{"progress": 140, "reason": "x"}, {"progress": 10, "reason": "  "}])
def test_bad_progress_is_rejected(store: Store, args: dict) -> None:
    slug = task(store, "Wire board")

    with pytest.raises(ChangeRejected):
        store.apply([Op("set_progress", {"slug": slug, **args})])


def test_rejected_write_changes_nothing(store: Store) -> None:
    a = task(store, "A")
    b = task(store, "B")
    store.apply([Op("add_dependency", {"task": a, "depends_on": b})])
    before = commits(store), (store.root / "log.md").read_text(), (store.root / f"tasks/{a}.md").read_text()

    with pytest.raises(ChangeRejected, match="->"):
        store.apply(
            [
                Op("update_task", {"slug": a, "title": "Changed"}),
                Op("add_dependency", {"task": b, "depends_on": a}),
            ]
        )

    assert before == (commits(store), (store.root / "log.md").read_text(), (store.root / f"tasks/{a}.md").read_text())


def test_grouped_operations_make_one_commit(store: Store) -> None:
    store.apply(
        [
            Op("create_task", {"title": "Parent"}),
            Op("create_task", {"title": "Child", "parent": "parent"}),
            Op("create_task", {"title": "Other", "depends_on": [{"task": "child"}]}),
        ],
        summary="Plan the work",
    )

    assert commits(store) == 2
    assert is_blocked(store.project, "other")
    assert store._git("log", "-1", "--format=%s").stdout.strip() == "Plan the work"


def test_new_task_can_depend_on_one_created_later_in_the_group(store: Store) -> None:
    store.apply(
        [
            Op("create_task", {"title": "Second", "depends_on": [{"task": "first"}]}),
            Op("create_task", {"title": "First"}),
        ]
    )

    assert is_blocked(store.project, "second")


def test_dependency_on_a_task_that_never_appears_is_rejected(store: Store) -> None:
    with pytest.raises(ChangeRejected, match="doesn't exist"):
        store.apply([Op("create_task", {"title": "Second", "depends_on": [{"task": "nothing"}]})])


def test_adding_a_child_clears_leaf_fields_from_the_parent(store: Store) -> None:
    parent = task(store, "Parent", effort_hours=5)
    store.apply([Op("set_progress", {"slug": parent, "progress": 30, "reason": "Started"})])

    task(store, "Child", parent=parent)

    frontmatter = store.project.concepts[f"tasks/{parent}.md"].frontmatter
    assert not {"state", "progress", "effort_hours"} & set(frontmatter)
    assert store.project.problems == []


def test_parents_can_not_have_progress_set(store: Store) -> None:
    parent = task(store, "Parent")
    task(store, "Child", parent=parent)

    with pytest.raises(ChangeRejected, match="subtasks"):
        store.apply([Op("set_state", {"slug": parent, "state": "done"})])


def test_move_task_keeps_dependencies_and_path(store: Store) -> None:
    group = task(store, "Roof")
    solar = task(store, "Solar")
    wiring = task(store, "Wiring", depends_on=[{"task": solar}])

    store.apply([Op("move_task", {"slug": solar, "parent": group})])

    assert store.project.tasks[solar].parent == group
    assert (store.root / f"tasks/{solar}.md").exists()
    assert is_blocked(store.project, wiring)


def test_moving_under_your_own_descendant_is_rejected(store: Store) -> None:
    parent = task(store, "Parent")
    child = task(store, "Child", parent=parent)

    with pytest.raises(ChangeRejected):
        store.apply([Op("move_task", {"slug": parent, "parent": child})])


def test_add_and_remove_dependency(store: Store) -> None:
    a = task(store, "A")
    b = task(store, "B")

    store.apply([Op("add_dependency", {"task": a, "depends_on": b, "strength": "soft"})])
    assert store.project.tasks[a].depends_on[0].strength == "soft"
    store.apply([Op("add_dependency", {"task": a, "depends_on": b, "strength": "hard"})])
    assert len(store.project.tasks[a].depends_on) == 1
    assert store.project.tasks[a].depends_on[0].strength == "hard"

    store.apply([Op("remove_dependency", {"task": a, "depends_on": b})])
    assert store.project.tasks[a].depends_on == []


def test_delete_refuses_tasks_others_rely_on(store: Store) -> None:
    a = task(store, "A")
    task(store, "B", depends_on=[{"task": a}])

    with pytest.raises(ChangeRejected, match="depend on"):
        store.apply([Op("delete_task", {"slug": a})])


def test_delete_task(store: Store) -> None:
    a = task(store, "A")

    store.apply([Op("delete_task", {"slug": a})])

    assert a not in store.project.tasks


def test_purchase_arrival_is_logged_as_arrived(store: Store) -> None:
    slug = task(store, "PIR board", kind="purchase")

    store.apply([Op("set_state", {"slug": slug, "state": "done"})])

    assert "**Arrived**" in (store.root / "log.md").read_text()


def test_update_current_state(store: Store) -> None:
    slug = task(store, "Wire board")

    store.apply([Op("update_current_state", {"slug": slug, "text": "Cables in the blue box."})])
    store.apply([Op("update_current_state", {"slug": slug, "text": "Cables routed."})])

    assert get_section(store.project.tasks[slug].body, "Current state") == "Cables routed."


def test_write_note_records_trust_and_rewriting_clears_verification(store: Store) -> None:
    _, [slug] = store.apply([Op("write_note", {"title": "Ceiling height", "body": "1420mm", "type": "Measurement"})], actor="MiniMax-M3/1")
    data = store.project.notes[slug].frontmatter
    assert data["generated"]["by"] == "MiniMax-M3/1"
    assert "verified" not in data

    store.apply([Op("verify_note", {"slug": slug})])
    assert store.project.notes[slug].frontmatter["verified"][0]["by"] == "human:owner"

    store.apply([Op("write_note", {"title": "Ceiling height", "slug": slug, "body": "1430mm", "type": "Measurement"})])
    assert "verified" not in store.project.notes[slug].frontmatter


def test_stale_after_needs_an_offset(store: Store) -> None:
    with pytest.raises(ChangeRejected, match="offset"):
        store.apply([Op("write_note", {"title": "Price", "body": "£40", "stale_after": "2027-01-01T00:00:00"})])


def test_unknown_keys_survive_a_write(store: Store) -> None:
    slug = task(store, "Wire board")
    path = store.root / f"tasks/{slug}.md"
    path.write_text(path.read_text().replace("kind: build", "kind: build\nmy_extension: keep me"))

    store.apply([Op("set_state", {"slug": slug, "state": "doing"})])

    assert "my_extension: keep me" in path.read_text()


def test_unknown_operation_is_rejected(store: Store) -> None:
    with pytest.raises(ChangeRejected, match="Unknown operation"):
        store.apply([Op("_commit", {})])


def test_undo_restores_the_previous_state(store: Store) -> None:
    slug = task(store, "Wire board")
    change, _ = store.apply([Op("set_progress", {"slug": slug, "progress": 40, "reason": "Oops"})])

    store.undo(change.id)

    assert store.project.tasks[slug].state == "todo"
    assert "**Undone**" in (store.root / "log.md").read_text()


def test_undo_of_a_creation_removes_the_file(store: Store) -> None:
    change, _ = store.apply([Op("create_task", {"title": "Mistake"})])

    store.undo(change.id)

    assert "mistake" not in store.project.tasks


def test_older_change_can_be_undone_when_only_the_log_has_moved_on(store: Store) -> None:
    a = task(store, "A")
    b = task(store, "B")
    change, _ = store.apply([Op("set_state", {"slug": a, "state": "doing"})])
    store.apply([Op("set_state", {"slug": b, "state": "doing"})])

    store.undo(change.id)

    assert store.project.tasks[a].state == "todo"
    assert store.project.tasks[b].state == "doing"


def test_undo_refuses_when_something_newer_changed_the_file(store: Store) -> None:
    slug = task(store, "A")
    change, _ = store.apply([Op("set_state", {"slug": slug, "state": "doing"})])
    store.apply([Op("set_state", {"slug": slug, "state": "done"})])

    with pytest.raises(UndoConflict):
        store.undo(change.id)
    assert store.project.tasks[slug].state == "done"


def test_undo_refuses_when_it_would_break_the_graph(store: Store) -> None:
    change, _ = store.apply([Op("create_task", {"title": "A"})])
    task(store, "B", depends_on=[{"task": "a"}])

    with pytest.raises(UndoConflict):
        store.undo(change.id)
    assert "a" in store.project.tasks


def test_hand_edits_are_picked_up_and_committed_separately(store: Store) -> None:
    slug = task(store, "Wire board")
    path = store.root / f"tasks/{slug}.md"
    path.write_text(path.read_text().replace("Wire board", "Wire the board"))

    assert store.project.tasks[slug].title == "Wire the board"

    other = task(store, "Other")
    subjects = store._git("log", "-2", "--format=%s").stdout.split("\n")
    assert subjects[1] == "Hand edits"
    assert other in store.project.tasks


def test_existing_faults_do_not_stop_unrelated_writes(store: Store) -> None:
    slug = task(store, "Good")
    (store.root / "tasks" / "broken.md").write_text("---\ntype: Task\ntitle: Broken\nparent: missing\n---\n")

    store.apply([Op("set_state", {"slug": slug, "state": "doing"})])

    assert store.project.tasks[slug].state == "doing"


@pytest.mark.parametrize(
    ("title", "slug"),
    [("Fit the Battery!", "fit-the-battery"), ("  50mm PIR  ", "50mm-pir"), ("!!!", "untitled")],
)
def test_slugify(title: str, slug: str) -> None:
    assert slugify(title) == slug


def test_set_section_adds_then_replaces_only_that_section() -> None:
    body = "\n## Notes\n\nKeep me.\n"

    updated = set_section(set_section(body, "Current state", "One"), "Current state", "Two")

    assert get_section(updated, "Current state") == "Two"
    assert get_section(updated, "Notes") == "Keep me."
