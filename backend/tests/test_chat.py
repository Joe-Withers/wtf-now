from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from wtf_now.chat import MAX_HISTORY, Chat, SessionStore, trim_history
from wtf_now.context import build_system
from wtf_now.proposals import ProposalStore
from wtf_now.store import Op, Store

from .test_agent import ScriptedModel, call, text

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def store(tmp_path: Path, clock: Clock) -> Store:
    store = Store(tmp_path / "bundle", clock=clock)
    store.initialise()
    store.apply(
        [
            Op("create_task", {"title": "Electrics"}),
            Op("create_task", {"title": "Wire board", "parent": "electrics", "effort_hours": 2}),
            Op("write_note", {"title": "Torque", "slug": "torque", "body": "Use 12Nm."}),
        ]
    )
    return store


def chat_with(store: Store, tmp_path: Path, clock: Clock, model: ScriptedModel) -> Chat:
    sessions = SessionStore(tmp_path / "sessions", clock)
    return Chat(model, store, sessions, ProposalStore(tmp_path / "proposals", store), clock)


def test_context_describes_the_current_position(store: Store, clock: Clock) -> None:
    store.apply(
        [
            Op("set_progress", {"slug": "wire-board", "progress": 50, "reason": "Half done"}),
            Op("update_current_state", {"slug": "wire-board", "text": "Cables in the blue box."}),
            Op("write_note", {"title": "Height", "body": "1420mm", "type": "Measurement"}),
        ]
    )

    system = build_system(store, clock(), [])

    assert "Cables in the blue box." in system
    assert "Electrics (electrics): 50%" in system
    assert "Height (height)" in system


def test_context_for_an_empty_project_prompts_an_interview(tmp_path: Path) -> None:
    store = Store(tmp_path / "empty")
    store.initialise()

    assert "no tasks yet" in build_system(store, NOW, [])


def test_focus_brings_in_the_task_and_its_linked_notes(store: Store, clock: Clock) -> None:
    path = store.root / "tasks" / "wire-board.md"
    path.write_text(path.read_text() + "\nSee [torque](/notes/torque.md).\n")

    system = build_system(store, clock(), [], focus="wire-board")

    assert "In focus: Wire board" in system
    assert "Use 12Nm." in system


def test_new_session_learns_where_things_were_left_from_the_bundle_alone(
    store: Store, tmp_path: Path, clock: Clock
) -> None:
    first = chat_with(
        store,
        tmp_path,
        clock,
        ScriptedModel(
            [call("update_current_state", slug="wire-board", text="Inverter cables crimped, not connected.")],
            [text("Noted.")],
        ),
    )
    list(first.send(first.sessions.create().id, "Crimped the inverter cables"))

    model = ScriptedModel([text("It was left with the inverter cables crimped.")])
    second = chat_with(store, tmp_path, clock, model)
    session = second.sessions.create()
    sent: dict = {}
    original = model.turn

    def spy(messages: list, *, system: str = "", tools: list = ()):
        sent["system"] = system
        return original(messages, system=system, tools=tools)

    model.turn = spy
    list(second.send(session.id, "Where did the board get to?"))

    assert "Inverter cables crimped, not connected." in sent["system"]
    assert len(model.seen[0]) == 1


def test_sessions_keep_history_between_messages(store: Store, tmp_path: Path, clock: Clock) -> None:
    model = ScriptedModel([text("One")], [text("Two")])
    chat = chat_with(store, tmp_path, clock, model)
    session = chat.sessions.create()

    list(chat.send(session.id, "First"))
    list(chat.send(session.id, "Second"))

    assert len(model.seen[1]) == 3
    saved = chat.sessions.get(session.id)
    assert saved.title == "First"
    assert [item["type"] for item in saved.display] == ["user", "assistant", "user", "assistant"]


def test_display_keeps_changes_and_proposals_in_order(store: Store, tmp_path: Path, clock: Clock) -> None:
    model = ScriptedModel(
        [text("Saving."), call("set_state", slug="wire-board", state="doing")],
        [
            call(
                "propose_changes",
                summary="Add a task",
                changes=[{"operation": "create_task", "args": {"title": "New"}}],
            )
        ],
        [text("Done.")],
    )
    chat = chat_with(store, tmp_path, clock, model)
    session = chat.sessions.create()

    list(chat.send(session.id, "Go"))

    assert [item["type"] for item in chat.sessions.get(session.id).display] == [
        "user",
        "assistant",
        "change",
        "proposal",
        "assistant",
    ]


def test_decision_reaches_the_ai_with_the_next_message(store: Store, tmp_path: Path, clock: Clock) -> None:
    model = ScriptedModel(
        [
            call(
                "propose_changes",
                summary="Add a task",
                changes=[{"operation": "create_task", "args": {"title": "New"}}],
            )
        ],
        [text("Asked.")],
        [text("Thanks.")],
    )
    chat = chat_with(store, tmp_path, clock, model)
    session = chat.sessions.create()
    events = list(chat.send(session.id, "Go"))
    proposal = next(event for event in events if event["type"] == "proposal")

    chat.decide(proposal["id"], approved=True)
    list(chat.send(session.id, "Next"))

    assert "new" in store.project.tasks
    assert "approved the proposal: Add a task" in model.seen[2][-1]["content"]


def test_abandoned_stream_leaves_a_usable_session(store: Store, tmp_path: Path, clock: Clock) -> None:
    model = ScriptedModel(
        [text("Saving."), call("set_state", slug="wire-board", state="doing")],
        [text("Later")],
        [text("Back again.")],
    )
    chat = chat_with(store, tmp_path, clock, model)
    session = chat.sessions.create()

    stream = chat.send(session.id, "Go")
    next(stream)
    stream.close()
    list(chat.send(session.id, "Are you there?"))

    roles = [message["role"] for message in chat.sessions.get(session.id).messages]
    assert roles[-1] == "assistant"
    assert all("tool_use" not in str(message) for message in chat.sessions.get(session.id).messages)


def test_expired_sessions_are_removed(store: Store, tmp_path: Path, clock: Clock) -> None:
    sessions = SessionStore(tmp_path / "sessions", clock)
    old = sessions.create()
    clock.now = NOW + timedelta(days=31)
    recent = sessions.create()

    assert [session.id for session in sessions.list()] == [recent.id]
    assert not (tmp_path / "sessions" / f"{old.id}.json").exists()


def test_trim_history_starts_at_something_the_owner_said() -> None:
    tool_turn = [
        {"role": "assistant", "content": [{"type": "tool_use", "id": "t", "name": "x", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t", "content": "ok"}]},
    ]
    messages = [{"role": "user", "content": "start"}] + tool_turn * MAX_HISTORY + [{"role": "user", "content": "latest"}]

    trimmed = trim_history(messages)

    assert trimmed == [{"role": "user", "content": "latest"}]
