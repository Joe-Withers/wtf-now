"""Blocking, roll-ups and downstream effort. All of it is deterministic code."""

from .project import Project, effective_dependencies


def is_done(project: Project, slug: str) -> bool:
    return all(project.tasks[leaf].state == "done" for leaf in project.leaves(slug))


def _unfinished_dependencies(project: Project, leaf: str, strength: str) -> list[str]:
    found: list[str] = []
    for dependency in effective_dependencies(project, leaf):
        if dependency.strength == strength and dependency.task not in found and not is_done(project, dependency.task):
            found.append(dependency.task)
    return found


def blockers(project: Project, leaf: str) -> list[str]:
    """The unfinished hard dependencies stopping a leaf, its own and inherited."""
    return _unfinished_dependencies(project, leaf, "hard")


def soft_warnings(project: Project, leaf: str) -> list[str]:
    """Unfinished soft dependencies. These warn, and never block."""
    return _unfinished_dependencies(project, leaf, "soft")


def is_blocked(project: Project, leaf: str) -> bool:
    return bool(blockers(project, leaf))


def progress(project: Project, slug: str) -> float:
    """Progress from 0 to 100, weighted by effort across a task's leaves."""
    leaves = [project.tasks[leaf] for leaf in project.leaves(slug)]
    total = sum(leaf.effort_hours for leaf in leaves)
    if total == 0:
        return sum(leaf.progress for leaf in leaves) / len(leaves)
    return sum(leaf.effort_hours * leaf.progress for leaf in leaves) / total


def derived_state(project: Project, slug: str) -> str:
    states = {project.tasks[leaf].state for leaf in project.leaves(slug)}
    if states == {"done"}:
        return "done"
    return "todo" if states == {"todo"} else "doing"


def remaining_hours(project: Project, slug: str) -> float:
    return sum(project.tasks[leaf].remaining_hours for leaf in project.leaves(slug))


def _hard_dependents(project: Project) -> dict[str, set[str]]:
    dependents: dict[str, set[str]] = {}
    for leaf in project.all_leaves():
        for dependency in effective_dependencies(project, leaf):
            if dependency.strength == "hard":
                for target in project.leaves(dependency.task):
                    dependents.setdefault(target, set()).add(leaf)
    return dependents


def _closure(dependents: dict[str, set[str]], leaf: str) -> set[str]:
    seen: set[str] = set()
    pending = list(dependents.get(leaf, ()))
    while pending:
        current = pending.pop()
        if current not in seen and current != leaf:
            seen.add(current)
            pending.extend(dependents.get(current, ()))
    return seen


def transitive_dependents(project: Project, slug: str) -> set[str]:
    """Every leaf that can't finish until this task's leaves do."""
    dependents = _hard_dependents(project)
    return {found for leaf in project.leaves(slug) for found in _closure(dependents, leaf)}


def downstream_hours(project: Project) -> dict[str, float]:
    """For each leaf, the remaining effort that transitively depends on finishing it."""
    dependents = _hard_dependents(project)
    return {
        leaf: sum(project.tasks[slug].remaining_hours for slug in _closure(dependents, leaf))
        for leaf in project.all_leaves()
    }


def overall_progress(project: Project) -> float:
    leaves = [project.tasks[leaf] for leaf in project.all_leaves()]
    total = sum(leaf.effort_hours for leaf in leaves)
    return sum(leaf.effort_hours * leaf.progress for leaf in leaves) / total if total else 0.0
