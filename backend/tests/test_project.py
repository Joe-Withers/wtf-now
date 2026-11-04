from pathlib import Path

from wtf_now.bundle import parse_concept, read_concepts
from wtf_now.project import Project, build_project, dependency_cycles

FAULTY_BUNDLE = Path(__file__).parent / "fixtures" / "faulty_bundle"


def project_from(tasks: dict[str, str]) -> Project:
    concepts = [
        parse_concept(f"tasks/{slug}.md", f"---\ntype: Task\ntitle: {slug}\n{frontmatter}---\n")
        for slug, frontmatter in tasks.items()
    ]
    return build_project(concepts)


def codes(project: Project, path: str) -> list[str]:
    return [problem.code for problem in project.problems if problem.path == path]


def test_faulty_bundle_reports_each_fault_and_keeps_valid_parts() -> None:
    project = build_project(*read_concepts(FAULTY_BUNDLE))

    assert codes(project, "tasks/unknown-parent.md") == ["unknown-parent"]
    assert codes(project, "tasks/unknown-dep.md") == ["unknown-dependency"]
    assert codes(project, "tasks/bad-values.md") == ["invalid-value"] * 4
    assert codes(project, "tasks/stray-parent.md") == ["parent-has-leaf-fields"]
    assert codes(project, "tasks/unreadable.md") == ["unreadable-file"]
    assert {problem.code for problem in project.problems} >= {"parent-cycle", "dependency-cycle"}

    assert codes(project, "tasks/good-leaf.md") == []
    assert project.tasks["good-leaf"].parent == "good-parent"
    assert project.tasks["good-leaf"].progress == 40
    assert project.tasks["unknown-parent"].parent is None
    assert [dependency.task for dependency in project.tasks["unknown-dep"].depends_on] == ["good-leaf"]


def test_bad_values_fall_back_to_defaults() -> None:
    project = build_project(*read_concepts(FAULTY_BUNDLE))
    task = project.tasks["bad-values"]

    assert (task.kind, task.state, task.progress, task.effort_hours) == ("build", "todo", 0, 1)


def test_tree_links_children_and_roots() -> None:
    project = project_from({"top": "", "mid": "parent: top\n", "leaf": "parent: mid\n"})

    assert project.roots == ["top"]
    assert project.children["top"] == ["mid"]
    assert project.leaves("top") == ["leaf"]
    assert list(project.ancestors("leaf")) == ["mid", "top"]


def test_progress_follows_state() -> None:
    project = project_from(
        {
            "not-started": "state: todo\nprogress: 50\n",
            "finished": "state: done\nprogress: 50\n",
            "underway": "state: doing\nprogress: 50\neffort_hours: 4\n",
        }
    )

    assert project.tasks["not-started"].progress == 0
    assert project.tasks["finished"].progress == 100
    assert project.tasks["underway"].progress == 50
    assert project.tasks["underway"].remaining_hours == 2


def test_cycle_through_inherited_dependency_is_found() -> None:
    project = project_from(
        {
            "parent": "depends_on:\n  - task: other\n",
            "child": "parent: parent\n",
            "other": "depends_on:\n  - task: child\n",
        }
    )

    assert dependency_cycles(project)


def test_depending_on_your_own_parent_is_a_cycle() -> None:
    project = project_from({"parent": "", "child": "parent: parent\ndepends_on:\n  - task: parent\n"})

    assert dependency_cycles(project)


def test_acyclic_graph_has_no_cycles() -> None:
    project = project_from(
        {"a": "depends_on:\n  - task: b\n  - task: c\n", "b": "depends_on:\n  - task: c\n", "c": ""}
    )

    assert dependency_cycles(project) == []
