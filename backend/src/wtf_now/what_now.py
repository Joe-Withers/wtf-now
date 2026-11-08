"""Answers "what should I do now?". Identical inputs give identical answers."""

import re
from dataclasses import dataclass, field
from datetime import date

from .bundle import LogDay, get_section
from .graph import blockers, downstream_hours, is_done, overall_progress, soft_warnings
from .project import SECONDARY_COUNT, Project, Task
from .store import CURRENT_STATE

SUGGESTION_COUNT = 3
RECENT_ENTRY_COUNT = 6
ARRIVAL_COUNT = 5
RECENT_STEP_COUNT = 4

_LINK = re.compile(r"\[([^]]*)\]\([^)]*\)")
_LABEL = re.compile(r"^\*\*([^*]+)\*\*:\s*(.*)$")
_TASK_LINK = re.compile(r"\[[^]]*\]\(/tasks/([a-z0-9-]+)\.md\)")

# Log entries that record the project being set up, rather than work being done.
SETUP_LABELS = {"Added", "Layout", "Drawing"}
# The log says "current state"; on a flow of steps, that is progress.
_STEP_LABELS = {"Current state": "Progress"}


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
class RecentStep:
    """Something the log says happened, and the task it was about."""

    slug: str
    title: str
    kind: str
    state: str
    label: str
    day: date


@dataclass
class WhatNow:
    can_do: list[WorkItem] = field(default_factory=list)
    order_first: list[WorkItem] = field(default_factory=list)
    on_its_way: list[WorkItem] = field(default_factory=list)
    decide_first: list[WorkItem] = field(default_factory=list)
    recent: list[RecentStep] = field(default_factory=list)


@dataclass
class LogLine:
    day: date
    label: str
    text: str
    task: str | None = None


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


def what_now(
    project: Project,
    hours: float | None = None,
    helper: bool = True,
    log: list[LogDay] | None = None,
) -> WhatNow:
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
    result.recent = recent_steps(project, log or [])
    return result


def recent_steps(
    project: Project,
    log: list[LogDay],
    count: int = RECENT_STEP_COUNT,
    only_done: bool = False,
) -> list[RecentStep]:
    """The last few tasks the log mentions, newest first, one step per task."""
    steps: list[RecentStep] = []
    seen: set[str] = set()
    for line in log_lines(log):
        slug = line.task
        if not slug or slug in seen or slug not in project.tasks or line.label in SETUP_LABELS:
            continue
        if only_done and not is_done(project, slug):
            continue
        seen.add(slug)
        task = project.tasks[slug]
        steps.append(RecentStep(slug, task.title, task.kind, task.state, _STEP_LABELS.get(line.label, line.label), line.day))
        if len(steps) >= count:
            break
    return steps


def suggestions(project: Project, hours: float | None = None, helper: bool = True) -> list[WorkItem]:
    """The top hands-on tasks. Longer jobs rank lower rather than leaving nothing to suggest."""
    downstream = downstream_hours(project)
    items = [
        _item(project, task, downstream)
        for task in _available(project)
        if task.kind == "build" and (helper or not task.needs_helper)
    ]
    return sorted(items, key=lambda item: _rank(item, hours))[:SUGGESTION_COUNT]


def recommendations(project: Project, hours: float | None = None) -> tuple[str | None, list[str]]:
    """The one job to do next, and a few more worth doing.

    The AI's picks stand while they are still unfinished and unblocked. When
    none of them are, the fixed ranking chooses, so there is always an answer.
    """
    downstream = downstream_hours(project)
    items = sorted((_item(project, task, downstream) for task in _available(project)), key=lambda item: _rank(item, hours))
    ranked = [item.slug for item in items]
    chosen = {slug: project.tasks[slug].recommended for slug in ranked if project.tasks[slug].recommended}
    if not chosen:
        return (ranked[0] if ranked else None), ranked[1 : 1 + SECONDARY_COUNT]
    firsts = [slug for slug in ranked if chosen.get(slug) == "next"]
    alsos = [slug for slug in ranked if chosen.get(slug) == "also"]
    primary = (firsts or alsos)[0]
    others = [slug for slug in firsts + alsos if slug != primary]
    return primary, others[:SECONDARY_COUNT]


def log_lines(days: list[LogDay]) -> list[LogLine]:
    lines = []
    for day in days:
        for entry in day.entries:
            plain = _LINK.sub(r"\1", entry)
            match = _LABEL.match(plain)
            label, text = (match[1], match[2]) if match else ("", plain)
            task = _TASK_LINK.search(entry)
            lines.append(LogLine(day.day, label, text, task.group(1) if task else None))
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
