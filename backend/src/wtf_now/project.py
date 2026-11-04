"""Builds the in-memory project from a bundle's concepts.

The loader never assumes validity, because files can be hand-edited. It
reports what's wrong and carries on with whatever it safely can.
"""

import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any

from .bundle import Concept, ConceptError

TASK_DIR = "tasks/"
NOTE_DIR = "notes/"
LAYOUT_DIR = "layouts/"
KINDS = ("build", "purchase", "research", "decision")
STATES = ("todo", "doing", "done")
STRENGTHS = ("hard", "soft")
LEAF_ONLY_FIELDS = ("state", "progress", "progress_reason", "effort_hours", "needs_helper", "cost")
DEFAULT_EFFORT_HOURS = 1.0

_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def is_valid_slug(slug: str) -> bool:
    return bool(_SLUG.match(slug))


@dataclass(frozen=True)
class Problem:
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class Dependency:
    task: str
    strength: str = "hard"


@dataclass
class Task:
    slug: str
    title: str
    description: str = ""
    parent: str | None = None
    kind: str = "build"
    state: str = "todo"
    stored_progress: float = 0.0
    progress_reason: str = ""
    stored_effort_hours: float | None = None
    zone: str | None = None
    closes_zone: str | None = None
    needs_helper: bool = False
    cost: float | None = None
    depends_on: list[Dependency] = field(default_factory=list)
    body: str = ""

    @property
    def progress(self) -> float:
        if self.state == "done":
            return 100.0
        return 0.0 if self.state == "todo" else self.stored_progress

    @property
    def effort_hours(self) -> float:
        return DEFAULT_EFFORT_HOURS if self.stored_effort_hours is None else self.stored_effort_hours

    @property
    def remaining_hours(self) -> float:
        return self.effort_hours * (100 - self.progress) / 100

    @property
    def path(self) -> str:
        return f"{TASK_DIR}{self.slug}.md"


@dataclass
class Project:
    concepts: dict[str, Concept] = field(default_factory=dict)  # by path
    tasks: dict[str, Task] = field(default_factory=dict)
    children: dict[str, list[str]] = field(default_factory=dict)
    roots: list[str] = field(default_factory=list)
    notes: dict[str, Concept] = field(default_factory=dict)
    layouts: dict[str, Concept] = field(default_factory=dict)
    problems: list[Problem] = field(default_factory=list)

    def is_leaf(self, slug: str) -> bool:
        return not self.children.get(slug)

    def ancestors(self, slug: str) -> Iterator[str]:
        parent = self.tasks[slug].parent
        while parent is not None:
            yield parent
            parent = self.tasks[parent].parent

    def leaves(self, slug: str) -> list[str]:
        if self.is_leaf(slug):
            return [slug]
        return [leaf for child in self.children[slug] for leaf in self.leaves(child)]

    def all_leaves(self) -> list[str]:
        return [slug for slug in self.tasks if self.is_leaf(slug)]


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _task_from_concept(concept: Concept, problems: list[Problem]) -> Task:
    data = concept.frontmatter

    def report(code: str, message: str) -> None:
        problems.append(Problem(code, concept.path, message))

    def choice(key: str, options: tuple[str, ...], default: str) -> str:
        value = data.get(key, default)
        if value not in options:
            report("invalid-value", f"{key} must be one of {', '.join(options)}, not {value!r}")
            return default
        return value

    def number(key: str, minimum: float, maximum: float | None = None) -> float | None:
        if key not in data or data[key] is None:
            return None
        value = _number(data[key])
        if value is None or value < minimum or (maximum is not None and value > maximum):
            report("invalid-value", f"{key} is out of range: {data[key]!r}")
            return None
        return value

    def optional_text(key: str) -> str | None:
        value = data.get(key)
        return None if value is None else str(value)

    if not is_valid_slug(concept.slug):
        report("invalid-slug", f"{concept.slug!r} is not a valid slug")
    title = data.get("title")
    if not title:
        report("invalid-value", "title is missing")

    dependencies: list[Dependency] = []
    raw_dependencies = data.get("depends_on") or []
    if not isinstance(raw_dependencies, list):
        report("invalid-value", "depends_on must be a list")
        raw_dependencies = []
    for entry in raw_dependencies:
        if not isinstance(entry, dict) or not entry.get("task"):
            report("invalid-value", f"bad depends_on entry: {entry!r}")
            continue
        strength = entry.get("strength", "hard")
        if strength not in STRENGTHS:
            report("invalid-value", f"bad dependency strength: {strength!r}")
            strength = "hard"
        dependencies.append(Dependency(str(entry["task"]), strength))

    return Task(
        slug=concept.slug,
        title=str(title or concept.slug),
        description=str(data.get("description") or ""),
        parent=optional_text("parent"),
        kind=choice("kind", KINDS, "build"),
        state=choice("state", STATES, "todo"),
        stored_progress=number("progress", 0, 100) or 0.0,
        progress_reason=str(data.get("progress_reason") or ""),
        stored_effort_hours=number("effort_hours", 0),
        zone=optional_text("zone"),
        closes_zone=optional_text("closes_zone"),
        needs_helper=data.get("needs_helper") is True,
        cost=number("cost", 0),
        depends_on=dependencies,
        body=concept.body,
    )


def _link_tree(project: Project) -> None:
    tasks = project.tasks
    for task in tasks.values():
        if task.parent is not None and task.parent not in tasks:
            project.problems.append(Problem("unknown-parent", task.path, f"parent {task.parent!r} doesn't exist"))
            task.parent = None

    for task in tasks.values():
        seen = {task.slug}
        current = task.parent
        while current is not None and current not in seen:
            seen.add(current)
            current = tasks[current].parent
        if current is not None:
            project.problems.append(Problem("parent-cycle", task.path, f"parent chain loops back to {current!r}"))
            task.parent = None

    project.children = {slug: [] for slug in tasks}
    project.roots = []
    for task in tasks.values():
        if task.parent is None:
            project.roots.append(task.slug)
        else:
            project.children[task.parent].append(task.slug)


def _check_parents(project: Project) -> None:
    for slug, task in project.tasks.items():
        if project.is_leaf(slug):
            continue
        frontmatter = project.concepts[task.path].frontmatter
        stray = [key for key in LEAF_ONLY_FIELDS if key in frontmatter]
        if stray:
            project.problems.append(Problem("parent-has-leaf-fields", task.path, f"parents don't store {', '.join(stray)}"))


def _check_dependencies(project: Project) -> None:
    for task in project.tasks.values():
        known = []
        for dependency in task.depends_on:
            if dependency.task in project.tasks:
                known.append(dependency)
            else:
                project.problems.append(Problem("unknown-dependency", task.path, f"depends on {dependency.task!r}, which doesn't exist"))
        task.depends_on = known


def effective_dependencies(project: Project, leaf: str) -> list[Dependency]:
    """A leaf's dependencies: its own plus those inherited from its ancestors."""
    owners = [leaf, *project.ancestors(leaf)]
    return [dependency for owner in owners for dependency in project.tasks[owner].depends_on]


def dependency_cycles(project: Project) -> list[list[str]]:
    """Finds cycles at leaf level, where inherited and parent dependencies are visible."""
    edges = {
        leaf: [target for dependency in effective_dependencies(project, leaf) for target in project.leaves(dependency.task)]
        for leaf in project.all_leaves()
    }
    finished: set[str] = set()
    cycles: list[list[str]] = []

    def visit(leaf: str, trail: list[str]) -> None:
        if leaf in trail:
            cycles.append(trail[trail.index(leaf) :] + [leaf])
            return
        if leaf in finished:
            return
        trail.append(leaf)
        for target in edges[leaf]:
            visit(target, trail)
        trail.pop()
        finished.add(leaf)

    for leaf in edges:
        visit(leaf, [])
    return cycles


def build_project(concepts: Iterable[Concept], errors: Iterable[ConceptError] = ()) -> Project:
    project = Project()
    project.problems = [Problem("unreadable-file", str(error).split(":")[0], str(error)) for error in errors]

    for concept in concepts:
        project.concepts[concept.path] = concept
        if concept.path.startswith(TASK_DIR) and concept.type == "Task":
            project.tasks[concept.slug] = _task_from_concept(concept, project.problems)
        elif concept.path.startswith(NOTE_DIR):
            project.notes[concept.slug] = concept
        elif concept.path.startswith(LAYOUT_DIR):
            project.layouts[concept.slug] = concept

    _link_tree(project)
    _check_parents(project)
    _check_dependencies(project)
    for cycle in dependency_cycles(project):
        project.problems.append(
            Problem("dependency-cycle", f"{TASK_DIR}{cycle[0]}.md", " -> ".join(cycle))
        )
    return project
