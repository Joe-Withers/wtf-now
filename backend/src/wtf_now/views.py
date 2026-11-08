"""Read models shared by the REST API and the AI's tools."""

import xml.etree.ElementTree as ElementTree
import zlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .bundle import Concept, LogDay, get_section, without_section
from .graph import (
    blockers,
    derived_state,
    downstream_hours,
    is_done,
    overall_progress,
    progress,
    remaining_hours,
    soft_warnings,
    transitive_dependents,
)
from .project import DRAWINGS_DIR, Dependency, Project, effective_dependencies
from .store import CURRENT_STATE
from .what_now import recent_steps

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
    photos: list[dict[str, str]]


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


def _photos(concept: Concept) -> list[dict[str, str]]:
    entries = concept.frontmatter.get("photos") or []
    return [
        {"key": str(entry["key"]), "caption": str(entry.get("caption", ""))}
        for entry in entries
        if isinstance(entry, dict) and entry.get("key")
    ]


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
        photos=_photos(project.concepts[task.path]),
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
    for concept in project.drawings.values():
        data = concept.frontmatter
        consider("drawing", concept.slug, str(data.get("title", concept.slug)), str(data.get("description", "")), concept.body)
    return hits[:SEARCH_LIMIT]


# How many colours the frontend has. A project with more groups than this has to repeat one.
CATEGORY_COLOURS = 12


def _colour(slug: str, taken: set[int] | None = None) -> int:
    """A stable colour for a category, so it keeps the same colour between visits.

    Two groups never share a colour: if the usual one is taken, the next free
    one is used instead.
    """
    start = zlib.crc32(slug.encode()) % CATEGORY_COLOURS
    if taken is None:
        taken = set()
    for step in range(CATEGORY_COLOURS):
        colour = (start + step) % CATEGORY_COLOURS
        if colour not in taken:
            taken.add(colour)
            return colour
    return start


def _category_of(project: Project, slug: str) -> str:
    """The top-level group a task belongs to."""
    roots = list(project.ancestors(slug))
    return roots[-1] if roots else slug


def _waiting_on(project: Project, slug: str) -> list[str]:
    """The things this task is waiting on, which aren't finished yet."""
    if project.is_leaf(slug):
        waiting = blockers(project, slug)
    else:
        waiting = [target for leaf in project.leaves(slug) for target in blockers(project, leaf)]
    return [target for target in dict.fromkeys(waiting) if not is_done(project, target)]


def _blocks(project: Project, slug: str) -> list[str]:
    """The tasks waiting on this one."""
    found = []
    for other in project.tasks.values():
        if other.slug == slug or is_done(project, other.slug):
            continue
        targets = (
            [dependency.task for dependency in effective_dependencies(project, other.slug)]
            if project.is_leaf(other.slug)
            else [dependency.task for dependency in other.depends_on]
        )
        if slug in targets:
            found.append(other.slug)
    return found


@dataclass
class MapTask:
    """A task as the map shows it: a dot in a cluster, or a card in a run of jobs."""

    slug: str
    title: str
    kind: str
    state: str
    progress: float
    category: str
    parent: str | None
    is_leaf: bool
    needs: list[str]
    blocks: list[str]
    children: list[str]
    note: str


@dataclass
class MapCategory:
    """A top-level group: the cluster a task belongs to."""

    slug: str
    title: str
    colour: int
    total: int
    done: int
    progress: float
    next: str | None


@dataclass
class MapNote:
    """A note, and the task it documents if it says so."""

    slug: str
    title: str
    task: str | None


@dataclass
class MapStep:
    """Something the log says you finished, and the day it happened."""

    slug: str
    title: str
    kind: str
    category: str
    label: str
    day: str


@dataclass
class ProjectMap:
    """The whole project, as the map and What now draw it."""

    total: int
    done: int
    progress: float
    categories: list[MapCategory]
    tasks: list[MapTask]
    notes: list[MapNote]
    recent: list[MapStep] = field(default_factory=list)


def _categories(project: Project) -> list[MapCategory]:
    downstream = downstream_hours(project)
    taken: set[int] = set()
    categories = []
    for root in project.roots:
        leaves = project.leaves(root)
        waiting = [
            leaf
            for leaf in leaves
            if project.tasks[leaf].state != "done" and not blockers(project, leaf)
        ]
        nxt = (
            max(waiting, key=lambda leaf: (project.tasks[leaf].state == "doing", downstream.get(leaf, 0.0)))
            if waiting
            else None
        )
        categories.append(
            MapCategory(
                slug=root,
                title=project.tasks[root].title,
                colour=_colour(root, taken),
                total=len(leaves),
                done=sum(1 for leaf in leaves if project.tasks[leaf].state == "done"),
                progress=progress(project, root),
                next=nxt,
            )
        )
    return categories


def _tasks(project: Project) -> list[MapTask]:
    return [
        MapTask(
            slug=slug,
            title=task.title,
            kind=task.kind,
            state=_state(project, slug),
            progress=progress(project, slug),
            category=_category_of(project, slug),
            parent=task.parent,
            is_leaf=project.is_leaf(slug),
            needs=_waiting_on(project, slug),
            blocks=_blocks(project, slug),
            children=list(project.children.get(slug, [])),
            note=get_section(task.body, CURRENT_STATE),
        )
        for slug, task in project.tasks.items()
    ]


def _notes(project: Project) -> list[MapNote]:
    notes = []
    for slug, concept in project.notes.items():
        related = concept.frontmatter.get("related")
        task = str(related) if related and str(related) in project.tasks else None
        notes.append(MapNote(slug, str(concept.frontmatter.get("title", slug)), task))
    return notes


def project_map(project: Project, log: list[LogDay] | None = None) -> ProjectMap:
    """Everything the map and What now need, in one read."""
    leaves = project.all_leaves()
    return ProjectMap(
        total=len(leaves),
        done=sum(1 for leaf in leaves if project.tasks[leaf].state == "done"),
        progress=overall_progress(project),
        categories=_categories(project),
        tasks=_tasks(project),
        notes=_notes(project),
        recent=_recent(project, log or []),
    )


def _recent(project: Project, log: list[LogDay]) -> list[MapStep]:
    """The last few things the log says you finished, newest first."""
    return [
        MapStep(
            slug=step.slug,
            title=step.title,
            kind=step.kind,
            category=_category_of(project, step.slug),
            label=step.label,
            day=step.day.isoformat(),
        )
        for step in recent_steps(project, log, only_done=True)
    ]


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
class ShapeView:
    id: str
    tag: str
    attributes: dict[str, str]


@dataclass
class ZoneView:
    id: str
    title: str
    progress: float | None
    tasks: list[TaskRef]
    shape: ShapeView | None


@dataclass
class DrawingView:
    slug: str
    title: str
    view_box: str
    zones: list[ZoneView]
    shapes: list[ShapeView]


@dataclass
class DrawingZones:
    """A drawing and the zones in it, so the AI can put tasks in the right place."""

    slug: str
    title: str
    zones: list[str]


def drawing_zones(project: Project) -> list[DrawingZones]:
    out = []
    for slug, concept in sorted(project.drawings.items()):
        zones = [
            str(entry["id"])
            for entry in concept.frontmatter.get("zones") or []
            if isinstance(entry, dict) and entry.get("id")
        ]
        out.append(DrawingZones(slug, str(concept.frontmatter.get("title", slug)), zones))
    return out


def _svg_shapes(path: Path) -> tuple[str, list[ShapeView]]:
    """Reads only geometry from an SVG, so a file can't put scripts in the page."""
    try:
        root = ElementTree.fromstring(path.read_text(encoding="utf-8"))
    except (OSError, ElementTree.ParseError):
        return "", []
    shapes = []
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag not in SHAPES:
            continue
        attributes = {key: value for key, value in element.attrib.items() if key in SHAPE_ATTRIBUTES}
        shapes.append(ShapeView(element.get("id", ""), tag, attributes))
    return root.get("viewBox", ""), shapes


def _zone_progress(project: Project, leaves: list[str]) -> float | None:
    total = sum(project.tasks[leaf].effort_hours for leaf in leaves)
    if not leaves or total == 0:
        return None
    return sum(project.tasks[leaf].effort_hours * project.tasks[leaf].progress for leaf in leaves) / total


def drawings(project: Project, root: Path) -> list[DrawingView]:
    views = []
    for slug, concept in sorted(project.drawings.items()):
        image = str(concept.frontmatter.get("image", f"{slug}.svg"))
        view_box, shapes = _svg_shapes(root / DRAWINGS_DIR / Path(image).name)
        by_id = {shape.id: shape for shape in shapes if shape.id}
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
                    shape=by_id.get(zone_id),
                )
            )
        views.append(DrawingView(slug, str(concept.frontmatter.get("title", slug)), view_box, zones, shapes))
    return views
