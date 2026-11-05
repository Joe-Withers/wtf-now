"""Read models shared by the REST API and the AI's tools."""

import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .bundle import Concept, get_section, without_section
from .graph import (
    blockers,
    derived_state,
    is_done,
    progress,
    remaining_hours,
    soft_warnings,
    transitive_dependents,
)
from .project import Dependency, Project
from .store import CURRENT_STATE

UNVERIFIED_BY_DEFAULT = "Measurement"
SEARCH_LIMIT = 20
SNIPPET_LENGTH = 160


class NotFound(Exception):
    pass


@dataclass
class TaskRef:
    slug: str
    title: str
    state: str


@dataclass
class TreeNode:
    slug: str
    title: str
    kind: str
    state: str
    progress: float
    remaining_hours: float
    blocked: bool
    children: list["TreeNode"] = field(default_factory=list)


@dataclass
class DependencyView:
    slug: str
    title: str
    strength: str
    done: bool
    inherited_from: str | None = None


@dataclass
class TaskDetail:
    slug: str
    title: str
    description: str
    kind: str
    state: str
    progress: float
    progress_reason: str
    effort_hours: float
    remaining_hours: float
    is_leaf: bool
    zone: str | None
    closes_zone: str | None
    needs_helper: bool
    cost: float | None
    current_state: str
    body: str
    notes: str
    breadcrumbs: list[TaskRef]
    children: list[TaskRef]
    depends_on: list[DependencyView]
    dependents: list[TaskRef]
    blocked_by: list[TaskRef]
    easier_after: list[TaskRef]
    closes_zone_title: str | None
    preflight: list[TaskRef]


@dataclass
class NoteSummary:
    slug: str
    title: str
    type: str
    description: str
    generated_by: str
    verified: bool
    needs_verifying: bool
    stale: bool


@dataclass
class NoteDetail(NoteSummary):
    body: str = ""


@dataclass
class SearchHit:
    kind: str
    slug: str
    title: str
    snippet: str


def _state(project: Project, slug: str) -> str:
    return project.tasks[slug].state if project.is_leaf(slug) else derived_state(project, slug)


def _ref(project: Project, slug: str) -> TaskRef:
    return TaskRef(slug, project.tasks[slug].title, _state(project, slug))


def _leaf_blocked(project: Project, slug: str) -> bool:
    return any(blockers(project, leaf) and project.tasks[leaf].state != "done" for leaf in project.leaves(slug))


def tree(project: Project) -> list[TreeNode]:
    def node(slug: str) -> TreeNode:
        task = project.tasks[slug]
        return TreeNode(
            slug=slug,
            title=task.title,
            kind=task.kind,
            state=_state(project, slug),
            progress=progress(project, slug),
            remaining_hours=remaining_hours(project, slug),
            blocked=_leaf_blocked(project, slug),
            children=[node(child) for child in project.children[slug]],
        )

    return [node(slug) for slug in project.roots]


def _dependency_views(project: Project, slug: str) -> list[DependencyView]:
    own = project.tasks[slug].depends_on
    views = [_dependency_view(project, dependency, None) for dependency in own]
    for ancestor in project.ancestors(slug):
        views += [_dependency_view(project, d, project.tasks[ancestor].title) for d in project.tasks[ancestor].depends_on]
    return views


def _dependency_view(project: Project, dependency: Dependency, inherited_from: str | None) -> DependencyView:
    target = project.tasks[dependency.task]
    return DependencyView(target.slug, target.title, dependency.strength, is_done(project, target.slug), inherited_from)


def preflight(project: Project, slug: str) -> list[TaskRef]:
    """Unfinished work in the zone a task will close off.

    Work that depends on the closing task is left out, because it comes afterwards.
    """
    task = project.tasks[slug]
    if task.closes_zone is None or is_done(project, slug):
        return []
    later = transitive_dependents(project, slug)
    own = set(project.leaves(slug))
    return [
        _ref(project, leaf)
        for leaf in project.all_leaves()
        if project.zone_of(leaf) == task.closes_zone
        and project.tasks[leaf].state != "done"
        and leaf not in later
        and leaf not in own
    ]


def task_detail(project: Project, slug: str) -> TaskDetail:
    task = project.tasks.get(slug)
    if task is None:
        raise NotFound(f"No task called {slug!r}")
    leaves = project.leaves(slug)
    blocking = dict.fromkeys(target for leaf in leaves for target in blockers(project, leaf) if project.tasks[leaf].state != "done")
    warnings = dict.fromkeys(target for leaf in leaves for target in soft_warnings(project, leaf))
    dependents = [other.slug for other in project.tasks.values() if any(d.task == slug for d in other.depends_on)]
    return TaskDetail(
        slug=slug,
        title=task.title,
        description=task.description,
        kind=task.kind,
        state=_state(project, slug),
        progress=progress(project, slug),
        progress_reason=task.progress_reason,
        effort_hours=sum(project.tasks[leaf].effort_hours for leaf in leaves),
        remaining_hours=remaining_hours(project, slug),
        is_leaf=project.is_leaf(slug),
        zone=task.zone,
        closes_zone=task.closes_zone,
        needs_helper=task.needs_helper,
        cost=task.cost,
        current_state=get_section(task.body, CURRENT_STATE),
        body=task.body,
        notes=without_section(task.body, CURRENT_STATE),
        breadcrumbs=[_ref(project, ancestor) for ancestor in reversed(list(project.ancestors(slug)))],
        children=[_ref(project, child) for child in project.children[slug]],
        depends_on=_dependency_views(project, slug),
        dependents=[_ref(project, dependent) for dependent in dependents],
        blocked_by=[_ref(project, target) for target in blocking],
        easier_after=[_ref(project, target) for target in warnings],
        closes_zone_title=project.zones().get(task.closes_zone or "", task.closes_zone),
        preflight=preflight(project, slug),
    )


def _is_stale(value: Any, now: datetime) -> bool:
    if value is None:
        return False
    try:
        moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    except ValueError:
        return False
    return now >= (moment if moment.tzinfo else moment.replace(tzinfo=UTC))


def _note_fields(concept: Concept, now: datetime) -> dict[str, Any]:
    data = concept.frontmatter
    generated = data.get("generated") or {}
    verified = bool(data.get("verified"))
    return {
        "slug": concept.slug,
        "title": str(data.get("title", concept.slug)),
        "type": concept.type,
        "description": str(data.get("description", "")),
        "generated_by": str(generated.get("by", "")) if isinstance(generated, dict) else "",
        "verified": verified,
        "needs_verifying": concept.type == UNVERIFIED_BY_DEFAULT and not verified,
        "stale": _is_stale(data.get("stale_after"), now),
    }


def notes(project: Project, now: datetime) -> list[NoteSummary]:
    summaries = [NoteSummary(**_note_fields(concept, now)) for concept in project.notes.values()]
    return sorted(summaries, key=lambda note: (not note.needs_verifying, note.title.lower()))


def note_detail(project: Project, slug: str, now: datetime) -> NoteDetail:
    concept = project.notes.get(slug)
    if concept is None:
        raise NotFound(f"No note called {slug!r}")
    return NoteDetail(**_note_fields(concept, now), body=concept.body)


def _snippet(text: str, index: int) -> str:
    start = max(0, index - 40)
    return " ".join(text[start : start + SNIPPET_LENGTH].split())


def search(project: Project, query: str) -> list[SearchHit]:
    wanted = query.strip().lower()
    if not wanted:
        return []
    hits: list[SearchHit] = []

    def consider(kind: str, slug: str, title: str, *texts: str) -> None:
        for text in (title, *texts):
            if (index := text.lower().find(wanted)) >= 0:
                hits.append(SearchHit(kind, slug, title, _snippet(text, index)))
                return

    for task in project.tasks.values():
        consider("task", task.slug, task.title, task.description, task.body)
    for concept in project.notes.values():
        data = concept.frontmatter
        consider("note", concept.slug, str(data.get("title", concept.slug)), str(data.get("description", "")), concept.body)
    return hits[:SEARCH_LIMIT]


def dependency_graph(project: Project) -> dict[str, list[dict[str, Any]]]:
    nodes = [
        {
            "slug": slug,
            "title": project.tasks[slug].title,
            "state": _state(project, slug),
            "blocked": _leaf_blocked(project, slug),
            "is_leaf": project.is_leaf(slug),
        }
        for slug in project.tasks
    ]
    edges = [
        {"from": dependency.task, "to": task.slug, "strength": dependency.strength}
        for task in project.tasks.values()
        for dependency in task.depends_on
    ]
    return {"nodes": nodes, "edges": edges}


@dataclass
class ShoppingItem:
    slug: str
    title: str
    area: str | None
    cost: float | None
    blocked_by: list[TaskRef]


@dataclass
class Shopping:
    to_order: list[ShoppingItem]
    on_order: list[ShoppingItem]
    arrived: list[ShoppingItem]
    still_to_spend: float
    spent: float
    unpriced: int


def shopping(project: Project) -> Shopping:
    groups: dict[str, list[ShoppingItem]] = {"todo": [], "doing": [], "done": []}
    for slug in sorted(project.all_leaves()):
        task = project.tasks[slug]
        if task.kind != "purchase":
            continue
        ancestors = list(project.ancestors(slug))
        groups[task.state].append(
            ShoppingItem(
                slug=slug,
                title=task.title,
                area=project.tasks[ancestors[-1]].title if ancestors else None,
                cost=task.cost,
                blocked_by=[_ref(project, target) for target in blockers(project, slug)] if task.state == "todo" else [],
            )
        )
    groups["todo"].sort(key=lambda item: bool(item.blocked_by))
    unfinished = groups["todo"] + groups["doing"]
    return Shopping(
        to_order=groups["todo"],
        on_order=groups["doing"],
        arrived=groups["done"],
        still_to_spend=sum(item.cost or 0 for item in unfinished),
        spent=sum(item.cost or 0 for item in groups["done"]),
        unpriced=sum(1 for item in unfinished if item.cost is None),
    )


SHAPES = {"rect", "path", "polygon", "circle", "ellipse"}
SHAPE_ATTRIBUTES = {"x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "d", "points", "transform"}


@dataclass
class ZoneView:
    id: str
    title: str
    progress: float | None
    tasks: list[TaskRef]
    shape: dict[str, Any] | None


@dataclass
class LayoutView:
    slug: str
    title: str
    view_box: str
    zones: list[ZoneView]


def _svg_shapes(path: Path) -> tuple[str, dict[str, dict[str, Any]]]:
    """Reads only geometry from an SVG, so a file can't put scripts in the page."""
    try:
        root = ElementTree.fromstring(path.read_text(encoding="utf-8"))
    except (OSError, ElementTree.ParseError):
        return "", {}
    shapes = {}
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag in SHAPES and element.get("id"):
            attributes = {key: value for key, value in element.attrib.items() if key in SHAPE_ATTRIBUTES}
            shapes[element.attrib["id"]] = {"tag": tag, "attributes": attributes}
    return root.get("viewBox", ""), shapes


def _zone_progress(project: Project, leaves: list[str]) -> float | None:
    total = sum(project.tasks[leaf].effort_hours for leaf in leaves)
    if not leaves or total == 0:
        return None
    return sum(project.tasks[leaf].effort_hours * project.tasks[leaf].progress for leaf in leaves) / total


def layouts(project: Project, root: Path) -> list[LayoutView]:
    views = []
    for slug, concept in sorted(project.layouts.items()):
        image = str(concept.frontmatter.get("image", f"{slug}.svg"))
        view_box, shapes = _svg_shapes(root / "layouts" / Path(image).name)
        zones = []
        for entry in concept.frontmatter.get("zones") or []:
            if not isinstance(entry, dict) or not entry.get("id"):
                continue
            zone_id = str(entry["id"])
            leaves = [leaf for leaf in project.all_leaves() if project.zone_of(leaf) == zone_id]
            zones.append(
                ZoneView(
                    id=zone_id,
                    title=str(entry.get("title", zone_id)),
                    progress=_zone_progress(project, leaves),
                    tasks=[_ref(project, leaf) for leaf in leaves],
                    shape=shapes.get(zone_id),
                )
            )
        views.append(LayoutView(slug, str(concept.frontmatter.get("title", slug)), view_box, zones))
    return views
