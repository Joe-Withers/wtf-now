from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest

from wtf_now.agent import MAX_STEPS, TOOLS, Tools, describe, run_conversation
from wtf_now.llm import Turn
from wtf_now.proposals import APPLIED, FAILED, REJECTED, ProposalStore
from wtf_now.store import ChangeRejected, Op, Store


def call(name: str, tool_id: str = "t1", **args) -> dict:
    return {"type": "tool_use", "id": tool_id, "name": name, "input": args}


def text(value: str) -> dict:
    return {"type": "text", "text": value}


class ScriptedModel:
    """Plays back prepared turns, and records what it was sent."""

    model = "scripted"

    def __init__(self, *turns: list[dict]) -> None:
        self.turns = list(turns)
        self.seen: list[list] = []

    def turn(self, messages: list, *, system: str = "", tools: list = ()) -> Iterator[str | Turn]:
        self.seen.append(list(messages))
        content = self.turns.pop(0)
        for block in content:
            if block["type"] == "text":
                yield block["text"]
        yield Turn(content, "tool_use" if any(b["type"] == "tool_use" for b in content) else "end_turn")


@pytest.fixture
def store(tmp_path: Path) -> Store:
    store = Store(tmp_path / "bundle", clock=lambda: datetime(2026, 11, 4, tzinfo=UTC))
    store.initialise()
    store.apply([Op("create_task", {"title": "Wire board", "effort_hours": 2}), Op("create_task", {"title": "Fit battery"})])
    return store


@pytest.fixture
def proposals(tmp_path: Path, store: Store) -> ProposalStore:
    return ProposalStore(tmp_path / "proposals", store)


def converse(store: Store, proposals: ProposalStore, model: ScriptedModel, say: str = "hello") -> tuple[list, list]:
    tools = Tools(store, proposals, "session", "wtf-now/scripted")
    messages = [{"role": "user", "content": say}]
    events = list(run_conversation(model, tools, messages, "system"))
    return events, messages


def of_type(events: list, kind: str) -> list:
    return [event for event in events if event["type"] == kind]


def test_plain_reply_streams_text(store: Store, proposals: ProposalStore) -> None:
    events, messages = converse(store, proposals, ScriptedModel([text("Hi there")]))

    assert of_type(events, "text") == [{"type": "text", "text": "Hi there"}]
    assert events[-1] == {"type": "done"}
    assert messages[-1] == {"role": "assistant", "content": [text("Hi there")]}


def test_text_either_side_of_a_tool_call_is_separated(store: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel([text("Checking."), call("list_tasks")], [text("All clear.")])

    events, _ = converse(store, proposals, model)

    assert "".join(event["text"] for event in of_type(events, "text")) == "Checking.\n\nAll clear."


def test_direct_tool_applies_and_offers_undo(store: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel(
        [text("Noted."), call("set_progress", slug="wire-board", progress=40, reason="Cables crimped")],
        [text("Done.")],
    )

    events, _ = converse(store, proposals, model)

    assert store.project.tasks["wire-board"].progress == 40
    [change] = of_type(events, "change")
    store.undo(change["id"])
    assert store.project.tasks["wire-board"].progress == 0


def test_notes_are_attributed_to_the_model(store: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel([call("write_note", title="Height", body="1420mm", type="Measurement")], [text("Saved.")])

    converse(store, proposals, model)

    assert store.project.notes["height"].frontmatter["generated"]["by"] == "wtf-now/scripted"


def test_proposal_changes_nothing_until_approved(store: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel(
        [
            call(
                "propose_changes",
                summary="Plan the solar work",
                changes=[
                    {"operation": "create_task", "args": {"title": "Buy solar", "slug": "buy-solar", "kind": "purchase"}},
                    {"operation": "add_dependency", "args": {"task": "wire-board", "depends_on": "buy-solar"}},
                ],
            )
        ],
        [text("Have a look at that.")],
    )

    events, _ = converse(store, proposals, model)

    assert "buy-solar" not in store.project.tasks
    [event] = of_type(events, "proposal")
    assert event["descriptions"] == ["Add purchase task “Buy solar”", "Wire board needs Buy solar first (hard)"]

    approved = proposals.approve(event["id"])

    assert approved.status == APPLIED
    assert "buy-solar" in store.project.tasks
    assert store.project.tasks["wire-board"].depends_on[0].task == "buy-solar"


def test_cycle_is_refused_before_it_reaches_the_owner(store: Store, proposals: ProposalStore) -> None:
    store.apply([Op("add_dependency", {"task": "wire-board", "depends_on": "fit-battery"})])
    model = ScriptedModel(
        [
            call(
                "propose_changes",
                summary="Reverse it",
                changes=[{"operation": "add_dependency", "args": {"task": "fit-battery", "depends_on": "wire-board"}}],
            )
        ],
        [text("That would make a loop.")],
    )

    events, messages = converse(store, proposals, model)

    assert of_type(events, "proposal") == []
    result = messages[2]["content"][0]
    assert result["is_error"] is True and "->" in result["content"]


def test_rejected_proposal_is_never_applied(store: Store, proposals: ProposalStore) -> None:
    proposal = proposals.create("session", "Delete it", [{"operation": "delete_task", "args": {"slug": "fit-battery"}}], ["x"])

    assert proposals.reject(proposal.id).status == REJECTED

    assert "fit-battery" in store.project.tasks
    with pytest.raises(ChangeRejected, match="already rejected"):
        proposals.approve(proposal.id)


def test_proposal_that_became_invalid_fails_on_approval(store: Store, proposals: ProposalStore) -> None:
    proposal = proposals.create("session", "Delete it", [{"operation": "delete_task", "args": {"slug": "fit-battery"}}], ["x"])
    store.apply([Op("delete_task", {"slug": "fit-battery"})])

    with pytest.raises(ChangeRejected):
        proposals.approve(proposal.id)

    assert proposals.get(proposal.id).status == FAILED
    assert proposals.pending() == []


def test_empty_project_applies_the_first_plan_directly(tmp_path: Path) -> None:
    store = Store(tmp_path / "empty")
    store.initialise()
    proposals = ProposalStore(tmp_path / "proposals", store)
    model = ScriptedModel(
        [call("propose_changes", summary="First plan", changes=[{"operation": "create_task", "args": {"title": "Start"}}])],
        [text("Set up.")],
    )

    events, _ = converse(store, proposals, model)

    assert "start" in store.project.tasks
    assert of_type(events, "proposal") == []
    assert len(of_type(events, "change")) == 1


def test_owner_verification_is_not_available_to_the_model(store: Store, proposals: ProposalStore) -> None:
    store.apply([Op("write_note", {"title": "Height", "body": "1420mm"})])
    model = ScriptedModel(
        [call("verify_note", slug="height")],
        [
            call(
                "propose_changes",
                summary="Sneak",
                changes=[{"operation": "verify_note", "args": {"slug": "height"}}],
            )
        ],
        [text("OK.")],
    )

    converse(store, proposals, model)

    assert "verified" not in store.project.notes["height"].frontmatter
    assert "verify_note" not in {tool["name"] for tool in TOOLS}


def test_tool_errors_go_back_to_the_model(store: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel([call("get_task", slug="nothing")], [call("get_task")], [text("Sorry.")])

    events, messages = converse(store, proposals, model)

    assert messages[2]["content"][0]["is_error"] is True
    assert messages[4]["content"][0]["is_error"] is True
    assert events[-1] == {"type": "done"}


def test_several_tool_calls_in_one_turn_all_get_results(store: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel(
        [call("get_task", "t1", slug="wire-board"), call("get_task", "t2", slug="fit-battery")], [text("Both read.")]
    )

    _, messages = converse(store, proposals, model)

    assert [result["tool_use_id"] for result in messages[2]["content"]] == ["t1", "t2"]


def test_endless_tool_use_is_stopped(store: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel(*[[call("list_tasks")] for _ in range(MAX_STEPS + 1)])

    events, _ = converse(store, proposals, model)

    assert events[-1]["type"] == "error"


def test_read_tools_all_run(store: Store, proposals: ProposalStore) -> None:
    store.apply([Op("write_note", {"title": "Height", "body": "1420mm"})])
    store.apply([Op("write_drawing", {"title": "Plan", "zones": [{"id": "rear", "title": "Rear", "x": 0, "y": 0, "width": 9, "height": 9}]})])
    tools = Tools(store, proposals, "session", "actor")

    for name, args in [
        ("list_tasks", {}),
        ("what_now", {"hours": 2}),
        ("search_docs", {"query": "1420"}),
        ("read_note", {"slug": "height"}),
        ("list_notes", {}),
        ("list_drawings", {}),
        ("read_log", {}),
    ]:
        output, events = tools.run(name, args)
        assert output and events == []


def test_list_drawings_gives_the_ai_the_zone_ids(store: Store, proposals: ProposalStore) -> None:
    store.apply([Op("write_drawing", {"title": "Plan", "zones": [{"id": "rear", "title": "Rear", "x": 0, "y": 0, "width": 9, "height": 9}]})])
    tools = Tools(store, proposals, "session", "actor")

    output, _ = tools.run("list_drawings", {})

    assert "rear" in output
    assert "Plan" in output


def test_describe_uses_titles() -> None:
    titles = {"a": "Alpha"}

    assert describe(titles, "move_task", {"slug": "a"}) == "Move Alpha under the top level"
    assert describe(titles, "update_task", {"slug": "a", "reason": "x", "zone": "rear"}) == "Change zone on Alpha"


@pytest.fixture
def zoned(store: Store) -> Store:
    store.apply(
        [
            Op("write_drawing", {"title": "Plan", "zones": [{"id": "rear", "title": "Rear", "x": 0, "y": 0, "width": 9, "height": 9}]}),
            Op("update_task", {"slug": "wire-board", "zone": "rear"}),
            Op("update_task", {"slug": "fit-battery", "closes_zone": "rear"}),
        ]
    )
    return store


def test_closing_a_zone_is_held_until_the_owner_confirms(zoned: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel(
        [call("set_state", slug="fit-battery", state="doing")],
        [text("Wire board is still unfinished in there. Anything else to go in first?")],
    )

    events, messages = converse(zoned, proposals, model)

    assert zoned.project.tasks["fit-battery"].state == "todo"
    assert of_type(events, "change") == []
    output = messages[2]["content"][0]["content"]
    assert "Wire board" in output and "confirmed" in output


def test_confirmed_closure_goes_ahead(zoned: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel([call("set_state", slug="fit-battery", state="doing", confirmed=True)], [text("Started.")])

    converse(zoned, proposals, model)

    assert zoned.project.tasks["fit-battery"].state == "doing"


def test_progress_on_a_closing_task_is_held_too(zoned: Store, proposals: ProposalStore) -> None:
    model = ScriptedModel(
        [call("set_progress", slug="fit-battery", progress=20, reason="Started")], [text("Asking first.")]
    )

    converse(zoned, proposals, model)

    assert zoned.project.tasks["fit-battery"].state == "todo"


def test_ai_can_propose_a_drawing_of_zones(store: Store, proposals: ProposalStore) -> None:
    zones = [{"id": "rear", "title": "Rear", "x": 0, "y": 0, "width": 9, "height": 9}]
    model = ScriptedModel(
        [call("propose_changes", summary="Add a drawing", changes=[{"operation": "write_drawing", "args": {"title": "Plan", "zones": zones}}])],
        [text("Have a look.")],
    )

    events, _ = converse(store, proposals, model)
    [proposal] = of_type(events, "proposal")
    assert proposal["descriptions"] == ["Create the drawing “Plan” with 1 zones"]

    proposals.approve(proposal["id"])

    assert store.project.zones() == {"rear": "Rear"}
