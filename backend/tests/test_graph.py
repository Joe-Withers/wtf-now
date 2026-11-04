import pytest

from wtf_now.graph import (
    blockers,
    derived_state,
    downstream_hours,
    is_blocked,
    is_done,
    progress,
    remaining_hours,
    soft_warnings,
)
from wtf_now.project import build_project

from .test_project import project_from

HARD = "depends_on:\n  - task: {}\n"
SOFT = "depends_on:\n  - task: {}\n    strength: soft\n"


def test_hard_dependency_blocks_until_done() -> None:
    blocked = project_from({"first": "", "second": HARD.format("first")})
    clear = project_from({"first": "state: done\n", "second": HARD.format("first")})

    assert blockers(blocked, "second") == ["first"]
    assert not is_blocked(clear, "second")


def test_soft_dependency_warns_but_does_not_block() -> None:
    project = project_from({"first": "", "second": SOFT.format("first")})

    assert not is_blocked(project, "second")
    assert soft_warnings(project, "second") == ["first"]


def test_leaf_inherits_a_block_from_its_ancestor() -> None:
    project = project_from(
        {
            "first": "",
            "grandparent": HARD.format("first"),
            "parent": "parent: grandparent\n",
            "leaf": "parent: parent\n",
        }
    )

    assert blockers(project, "leaf") == ["first"]


def test_dependency_on_a_parent_needs_all_its_leaves() -> None:
    project = project_from(
        {
            "group": "",
            "one": "parent: group\nstate: done\n",
            "two": "parent: group\n",
            "waiting": HARD.format("group"),
        }
    )
    assert is_blocked(project, "waiting")

    finished = project_from(
        {
            "group": "",
            "one": "parent: group\nstate: done\n",
            "two": "parent: group\nstate: done\n",
            "waiting": HARD.format("group"),
        }
    )
    assert is_done(finished, "group")
    assert not is_blocked(finished, "waiting")


def test_same_blocker_is_listed_once() -> None:
    project = project_from({"first": "", "parent": HARD.format("first"), "leaf": "parent: parent\n" + HARD.format("first")})

    assert blockers(project, "leaf") == ["first"]


def test_progress_is_weighted_by_effort() -> None:
    project = project_from(
        {
            "group": "",
            "nail": "parent: group\nstate: done\neffort_hours: 1\n",
            "circuit-board": "parent: group\nstate: doing\nprogress: 50\neffort_hours: 9\n",
        }
    )

    assert progress(project, "group") == pytest.approx(55)
    assert remaining_hours(project, "group") == pytest.approx(4.5)


def test_missing_effort_counts_as_one_hour() -> None:
    project = project_from(
        {"group": "", "a": "parent: group\nstate: done\n", "b": "parent: group\neffort_hours: 3\n"}
    )

    assert progress(project, "group") == pytest.approx(25)


def test_zero_effort_leaves_do_not_divide_by_zero() -> None:
    project = project_from({"group": "", "a": "parent: group\neffort_hours: 0\nstate: done\n", "b": "parent: group\neffort_hours: 0\n"})

    assert progress(project, "group") == 50


def test_adding_work_shrinks_the_parent_bar() -> None:
    before = project_from({"group": "", "a": "parent: group\nstate: done\neffort_hours: 2\n"})
    after = project_from(
        {"group": "", "a": "parent: group\nstate: done\neffort_hours: 2\n", "new": "parent: group\neffort_hours: 2\n"}
    )

    assert progress(before, "group") > progress(after, "group")


def test_derived_state() -> None:
    project = project_from(
        {
            "fresh": "",
            "a": "parent: fresh\n",
            "mixed": "",
            "b": "parent: mixed\nstate: done\n",
            "c": "parent: mixed\n",
            "finished": "",
            "d": "parent: finished\nstate: done\n",
        }
    )

    assert [derived_state(project, slug) for slug in ("fresh", "mixed", "finished")] == ["todo", "doing", "done"]


def test_downstream_hours_are_transitive() -> None:
    project = project_from(
        {
            "a": "effort_hours: 1\n",
            "b": "effort_hours: 2\n" + HARD.format("a"),
            "c": "effort_hours: 4\n" + HARD.format("b"),
            "unrelated": "effort_hours: 8\n",
        }
    )

    assert downstream_hours(project)["a"] == 6
    assert downstream_hours(project)["c"] == 0


def test_soft_dependants_do_not_count_as_downstream() -> None:
    project = project_from({"a": "", "b": "effort_hours: 2\n" + SOFT.format("a")})

    assert downstream_hours(project)["a"] == 0


def test_cycles_do_not_hang_the_engine() -> None:
    project = project_from({"a": HARD.format("b"), "b": HARD.format("a")})

    assert blockers(project, "a") == ["b"]
    assert downstream_hours(project)["a"] == pytest.approx(1)


def test_empty_project() -> None:
    assert downstream_hours(build_project([])) == {}
