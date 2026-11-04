"""Answers "what should I do now?". Identical inputs give identical answers."""

import re
from dataclasses import dataclass, field
from datetime import date

from .bundle import LogDay, get_section
from .graph import blockers, downstream_hours, overall_progress, soft_warnings
from .project import Project, Task
from .store import CURRENT_STATE

SUGGESTION_COUNT = 3
RECENT_ENTRY_COUNT = 6
ARRIVAL_COUNT = 5

_LINK = re.compile(r"\[([^]]*)\]\([^)]*\)")
_LABEL = re.compile(r"^\*\*([^*]+)\*\*:\s*(.*)$")


@dataclass
class WorkItem:
    slug: str
    title: str
    kind: str
    state: str
    progress: float
    remaining_hours: float
    needs_helper: bool
    zone: str | None
    area: str | None
    current_state: str
    unlocks_hours: float
    easier_after: list[str] = field(default_factory=list)


@dataclass
class WhatNow:
    can_do: list[WorkItem] = field(default_factory=list)
    order_first: list[WorkItem] = field(default_factory=list)
    on_its_way: list[WorkItem] = field(default_factory=list)
    decide_first: list[WorkItem] = field(default_factory=list)


@dataclass
class LogLine:
    day: date
    label: str
    text: str


@dataclass
class Home:
    last_activity: date | None
    days_away: int | None
    overall_progress: float
    last_session: list[LogLine]
    in_progress: list[WorkItem]
    on_order: list[WorkItem]
    arrived: list[LogLine]
    suggestions: list[WorkItem]


def _area(project: Project, task: Task) -> str | None:
    roots = list(project.ancestors(task.slug))
    return project.tasks[roots[-1]].title if roots else None


def _item(project: Project, task: Task, downstream: dict[str, float]) -> WorkItem:
    return WorkItem(
        slug=task.slug,
        title=task.title,
        kind=task.kind,
        state=task.state,
        progress=task.progress,
        remaining_hours=task.remaining_hours,
        needs_helper=task.needs_helper,
        zone=task.zone,
        area=_area(project, task),
        current_state=get_section(task.body, CURRENT_STATE),
        unlocks_hours=downstream[task.slug],
        easier_after=[project.tasks[slug].title for slug in soft_warnings(project, task.slug)],
    )


def _available(project: Project) -> list[Task]:
    leaves = (project.tasks[slug] for slug in project.all_leaves())
    return [leaf for leaf in leaves if leaf.state != "done" and not blockers(project, leaf.slug)]


def _rank(item: WorkItem, hours: float | None) -> tuple:
    fits = hours is None or item.remaining_hours <= hours
    return (not fits, item.state != "doing", -item.unlocks_hours, item.slug)


def what_now(project: Project, hours: float | None = None, helper: bool = True) -> WhatNow:
    """Groups available work. The filters apply to hands-on work, not to ordering or deciding."""
    downstream = downstream_hours(project)
    result = WhatNow()
    for task in _available(project):
        item = _item(project, task, downstream)
        if task.kind == "build":
            fits_time = hours is None or item.remaining_hours <= hours
            if fits_time and (helper or not task.needs_helper):
                result.can_do.append(item)
        elif task.kind == "purchase":
            (result.order_first if task.state == "todo" else result.on_its_way).append(item)
        else:
            result.decide_first.append(item)
    for group in (result.can_do, result.order_first, result.on_its_way, result.decide_first):
        group.sort(key=lambda item: _rank(item, hours))
    return result


def suggestions(project: Project, hours: float | None = None, helper: bool = True) -> list[WorkItem]:
    """The top hands-on tasks. Longer jobs rank lower rather than leaving nothing to suggest."""
    downstream = downstream_hours(project)
    items = [
        _item(project, task, downstream)
        for task in _available(project)
        if task.kind == "build" and (helper or not task.needs_helper)
    ]
    return sorted(items, key=lambda item: _rank(item, hours))[:SUGGESTION_COUNT]


def log_lines(days: list[LogDay]) -> list[LogLine]:
    lines = []
    for day in days:
        for entry in day.entries:
            plain = _LINK.sub(r"\1", entry)
            match = _LABEL.match(plain)
            lines.append(LogLine(day.day, match[1], match[2]) if match else LogLine(day.day, "", plain))
    return lines


def home(project: Project, log: list[LogDay], today: date) -> Home:
    lines = log_lines(log)
    last_activity = lines[0].day if lines else None
    downstream = downstream_hours(project)
    underway = [
        _item(project, project.tasks[slug], downstream)
        for slug in project.all_leaves()
        if project.tasks[slug].state == "doing"
    ]
    return Home(
        last_activity=last_activity,
        days_away=(today - last_activity).days if last_activity else None,
        overall_progress=overall_progress(project),
        last_session=[line for line in lines if line.day == last_activity][:RECENT_ENTRY_COUNT],
        in_progress=sorted((i for i in underway if i.kind != "purchase"), key=lambda i: i.slug),
        on_order=sorted((i for i in underway if i.kind == "purchase"), key=lambda i: i.slug),
        arrived=[line for line in lines if line.label == "Arrived"][:ARRIVAL_COUNT],
        suggestions=suggestions(project),
    )
