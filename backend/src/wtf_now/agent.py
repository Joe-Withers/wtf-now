"""The AI's tools and the conversation loop."""

import json
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass, is_dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from . import views
from .llm import LLMError, Turn
from .proposals import ProposalStore
from .store import ChangeRejected, Op, Store
from .what_now import log_lines, what_now

MAX_STEPS = 16
LOG_LINES = 30
PROPOSABLE = ("create_task", "update_task", "move_task", "delete_task", "add_dependency", "remove_dependency")


class Model(Protocol):
    model: str

    def turn(self, messages: list, *, system: str = "", tools: list = ()) -> Iterator[str | Turn]: ...


def _tool(name: str, description: str, properties: dict[str, Any] | None = None, required: tuple[str, ...] = ()) -> dict:
    return {
        "name": name,
        "description": description,
        "input_schema": {"type": "object", "properties": properties or {}, "required": list(required)},
    }


TEXT = {"type": "string"}
SLUG = {"type": "string", "description": "The task's slug"}

NUMBER = {"type": "number"}
CHANGE_ARGS = {
    "slug": TEXT,
    "title": TEXT,
    "parent": TEXT,
    "kind": {"enum": ["build", "purchase", "research", "decision"]},
    "description": TEXT,
    "effort_hours": NUMBER,
    "zone": TEXT,
    "closes_zone": TEXT,
    "needs_helper": {"type": "boolean"},
    "cost": NUMBER,
    "reason": TEXT,
    "task": TEXT,
    "depends_on": {
        "description": "A slug for add_dependency and remove_dependency, or a list of {task, strength} for create_task"
    },
    "strength": {"enum": ["hard", "soft"]},
}

TOOLS = [
    _tool("list_tasks", "The whole task tree with state, progress and whether each task is blocked."),
    _tool("get_task", "Everything about one task: notes, dependencies, blockers and dependents.", {"slug": SLUG}, ("slug",)),
    _tool(
        "what_now",
        "Available work, grouped into can do, order first, on its way, and decide first.",
        {
            "hours": {"type": "number", "description": "Hours available, if the owner said"},
            "helper": {"type": "boolean", "description": "Whether a second person is available"},
        },
    ),
    _tool("search_wiki", "Search tasks and notes for text.", {"query": TEXT}, ("query",)),
    _tool("read_note", "Read a wiki note.", {"slug": TEXT}, ("slug",)),
    _tool("list_notes", "List wiki notes, including their type and whether they're verified or stale."),
    _tool("read_log", "Read recent project history, newest first."),
    _tool(
        "set_progress",
        "Record an estimate of how far through a leaf task is. Only call this when something has actually happened.",
        {"slug": SLUG, "progress": {"type": "number", "minimum": 0, "maximum": 100}, "reason": TEXT},
        ("slug", "progress", "reason"),
    ),
    _tool(
        "set_state",
        "Set a leaf task to todo, doing or done. For purchases: todo is to order, doing is on order, done is arrived.",
        {"slug": SLUG, "state": {"enum": ["todo", "doing", "done"]}, "reason": TEXT},
        ("slug", "state"),
    ),
    _tool(
        "update_current_state",
        "Rewrite the task's Current state section: exactly where it was left, in enough detail to pick it up months later.",
        {"slug": SLUG, "text": TEXT},
        ("slug", "text"),
    ),
    _tool(
        "write_note",
        "Create or replace a wiki note. Use type Measurement for dimensions, Research for findings, Decision for "
        "choices and why, Part for part numbers, Inventory for tools and stock. Set stale_after on prices, as an "
        "ISO 8601 time with a UTC offset.",
        {
            "title": TEXT,
            "body": {"type": "string", "description": "Markdown"},
            "slug": {"type": "string", "description": "Existing note to replace; leave out for a new one"},
            "type": TEXT,
            "description": TEXT,
            "stale_after": TEXT,
        },
        ("title", "body"),
    ),
    _tool(
        "propose_changes",
        "Propose structural changes as one group for the owner to approve. Put everything related in a single call. "
        "Tasks created in the group can be referred to by the slug you give them. Argument names by operation: "
        "create_task(title, slug, parent, kind, description, effort_hours, zone, closes_zone, needs_helper, cost, "
        "depends_on: [{task, strength}]); update_task(slug, reason, title, description, kind, zone, closes_zone, "
        "effort_hours, needs_helper, cost); move_task(slug, parent); delete_task(slug); "
        "add_dependency(task, depends_on, strength); remove_dependency(task, depends_on). "
        "Strength is hard if the order is physically forced, soft if one order is just easier. "
        "Kind is build, purchase, research or decision.",
        {
            "summary": {"type": "string", "description": "One line describing the group"},
            "changes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "operation": {"enum": list(PROPOSABLE)},
                        "args": {"type": "object", "properties": CHANGE_ARGS},
                    },
                    "required": ["operation", "args"],
                },
            },
        },
        ("summary", "changes"),
    ),
]


def _plain(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


def _json(value: Any) -> str:
    return json.dumps(_plain(value), default=str)


def describe(project_titles: dict[str, str], operation: str, args: dict[str, Any]) -> str:
    """A plain sentence for the approval card."""

    def title(slug: Any) -> str:
        return project_titles.get(str(slug), str(slug))

    match operation:
        case "create_task":
            where = f" under {title(args['parent'])}" if args.get("parent") else ""
            return f"Add {args.get('kind', 'build')} task “{args.get('title')}”{where}"
        case "update_task":
            fields = ", ".join(key for key in args if key not in ("slug", "reason"))
            return f"Change {fields} on {title(args.get('slug'))}"
        case "move_task":
            return f"Move {title(args.get('slug'))} under {title(args['parent']) if args.get('parent') else 'the top level'}"
        case "delete_task":
            return f"Delete {title(args.get('slug'))}"
        case "add_dependency":
            return f"{title(args.get('task'))} needs {title(args.get('depends_on'))} first ({args.get('strength', 'hard')})"
        case "remove_dependency":
            return f"{title(args.get('task'))} no longer needs {title(args.get('depends_on'))}"
    return operation


@dataclass
class Tools:
    store: Store
    proposals: ProposalStore
    session_id: str
    actor: str
    clock: Callable[[], datetime] = lambda: datetime.now(UTC)

    def _direct(self, op: Op) -> tuple[str, list[dict]]:
        change, results = self.store.apply([op], actor=self.actor)
        event = {"type": "change", "id": change.id, "summary": change.summary}
        return _json({"applied": True, "result": results[0]}), [event]

    def _propose(self, summary: str, changes: list[dict[str, Any]]) -> tuple[str, list[dict]]:
        unknown = [change.get("operation") for change in changes if change.get("operation") not in PROPOSABLE]
        if unknown or not changes:
            raise ChangeRejected(f"Can't propose: {unknown or 'an empty list'}")
        ops = [Op(change["operation"], change.get("args", {})) for change in changes]
        if not self.store.project.tasks:  # the first interview, reviewed as a whole afterwards
            change, _ = self.store.apply(ops, actor=self.actor, summary=summary)
            return _json({"applied": True}), [{"type": "change", "id": change.id, "summary": summary}]

        self.store.check(ops, actor=self.actor)
        titles = {slug: task.title for slug, task in self.store.project.tasks.items()}
        for change in changes:
            if change["operation"] == "create_task" and change["args"].get("slug"):
                titles[change["args"]["slug"]] = change["args"].get("title", "")
        descriptions = [describe(titles, change["operation"], change.get("args", {})) for change in changes]
        proposal = self.proposals.create(self.session_id, summary, changes, descriptions)
        event = {"type": "proposal", **asdict(proposal)}
        return _json({"applied": False, "status": "waiting for the owner's approval"}), [event]

    def run(self, name: str, args: dict[str, Any]) -> tuple[str, list[dict]]:
        """Runs a tool, returning its output for the model and events for the owner."""
        project = self.store.project
        match name:
            case "list_tasks":
                return _json(views.tree(project)), []
            case "get_task":
                return _json(views.task_detail(project, args["slug"])), []
            case "what_now":
                return _json(what_now(project, args.get("hours"), args.get("helper", True))), []
            case "search_wiki":
                return _json(views.search(project, args["query"])), []
            case "read_note":
                return _json(views.note_detail(project, args["slug"], self.clock())), []
            case "list_notes":
                return _json(views.notes(project, self.clock())), []
            case "read_log":
                return _json(log_lines(self.store.log())[:LOG_LINES]), []
            case "set_progress" | "set_state" | "update_current_state" | "write_note":
                return self._direct(Op(name, args))
            case "propose_changes":
                return self._propose(args["summary"], args["changes"])
        raise ChangeRejected(f"Unknown tool: {name}")


def run_conversation(
    llm: Model, tools: Tools, messages: list[dict[str, Any]], system: str
) -> Iterator[dict[str, Any]]:
    """Runs one owner message to completion, appending to `messages` as steps finish.

    Each assistant turn is added together with its tool results, so a dropped
    connection can't leave the history with an unanswered tool call.
    """
    try:
        said_something = False
        for _ in range(MAX_STEPS):
            finished: Turn | None = None
            started = False
            for part in llm.turn(messages, system=system, tools=TOOLS):
                if isinstance(part, Turn):
                    finished = part
                else:
                    if said_something and not started:
                        yield {"type": "text", "text": "\n\n"}
                    started = said_something = True
                    yield {"type": "text", "text": part}
            assert finished is not None

            calls = [block for block in finished.content if block.get("type") == "tool_use"]
            results = []
            for call in calls:
                yield {"type": "tool", "name": call["name"]}
                try:
                    output, events = tools.run(call["name"], call.get("input") or {})
                    results.append({"type": "tool_result", "tool_use_id": call["id"], "content": output})
                    yield from events
                except (ChangeRejected, views.NotFound, KeyError, TypeError, AttributeError) as error:
                    results.append(
                        {"type": "tool_result", "tool_use_id": call["id"], "content": str(error), "is_error": True}
                    )

            messages.append({"role": "assistant", "content": finished.content})
            if not calls:
                yield {"type": "done"}
                return
            messages.append({"role": "user", "content": results})
        yield {"type": "error", "message": "That took too many steps, so I stopped."}
    except LLMError as error:
        yield {"type": "error", "message": f"The AI service failed: {error}"}
