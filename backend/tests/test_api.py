from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from wtf_now.api import create_app
from wtf_now.store import Op, Store

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    store = Store(tmp_path / "bundle", clock=lambda: NOW)
    store.initialise()
    return TestClient(create_app(store, clock=lambda: NOW))


def new_task(client: TestClient, title: str, **fields) -> str:
    response = client.post("/api/tasks", json={"title": title, **fields})
    assert response.status_code == 201, response.text
    return response.json()["results"][0]


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_create_and_read_a_task(client: TestClient) -> None:
    slug = new_task(client, "Wire board", kind="build", effort_hours=3)

    task = client.get(f"/api/tasks/{slug}").json()

    assert task["title"] == "Wire board"
    assert task["is_leaf"] is True
    assert task["effort_hours"] == 3


def test_missing_things_return_404(client: TestClient) -> None:
    assert client.get("/api/tasks/nothing").status_code == 404
    assert client.get("/api/notes/nothing").status_code == 404
    assert client.post("/api/tasks/nothing/state", json={"state": "done"}).status_code == 404


def test_tree_rolls_up_progress(client: TestClient) -> None:
    parent = new_task(client, "Group")
    child = new_task(client, "Child", parent=parent, effort_hours=2)
    new_task(client, "Other", parent=parent, effort_hours=2)
    client.post(f"/api/tasks/{child}/state", json={"state": "done"})

    [root] = client.get("/api/tree").json()

    assert root["progress"] == 50
    assert root["state"] == "doing"
    assert len(root["children"]) == 2


def test_task_detail_shows_blockers_and_links(client: TestClient) -> None:
    first = new_task(client, "First")
    second = new_task(client, "Second", depends_on=[{"task": first}])

    task = client.get(f"/api/tasks/{second}").json()
    other = client.get(f"/api/tasks/{first}").json()

    assert [ref["slug"] for ref in task["blocked_by"]] == [first]
    assert task["depends_on"][0]["strength"] == "hard"
    assert [ref["slug"] for ref in other["dependents"]] == [second]


def test_inherited_dependency_is_visible_on_the_child(client: TestClient) -> None:
    first = new_task(client, "First")
    parent = new_task(client, "Parent", depends_on=[{"task": first}])
    child = new_task(client, "Child", parent=parent)

    task = client.get(f"/api/tasks/{child}").json()

    assert task["depends_on"][0]["inherited_from"] == "Parent"
    assert [ref["slug"] for ref in task["blocked_by"]] == [first]


def test_what_now_filters(client: TestClient) -> None:
    new_task(client, "Short", effort_hours=1)
    new_task(client, "Long", effort_hours=9)
    new_task(client, "Lift", effort_hours=1, needs_helper=True)

    assert len(client.get("/api/what-now").json()["can_do"]) == 3
    assert len(client.get("/api/what-now?hours=2").json()["can_do"]) == 2
    assert len(client.get("/api/what-now?hours=2&helper=false").json()["can_do"]) == 1


def test_home(client: TestClient) -> None:
    slug = new_task(client, "Wire board")
    client.post(f"/api/tasks/{slug}/progress", json={"progress": 30, "reason": "Started wiring"})
    client.post(f"/api/tasks/{slug}/current-state", json={"text": "Cables cut."})

    home = client.get("/api/home").json()

    assert home["days_away"] == 0
    assert home["in_progress"][0]["current_state"] == "Cables cut."
    assert home["suggestions"][0]["slug"] == slug


def test_cycle_is_rejected_with_a_reason(client: TestClient) -> None:
    a = new_task(client, "A")
    b = new_task(client, "B", depends_on=[{"task": a}])

    response = client.post(f"/api/tasks/{a}/dependencies", json={"task": b})

    assert response.status_code == 422
    assert "->" in response.json()["detail"]


def test_update_can_clear_a_field(client: TestClient) -> None:
    slug = new_task(client, "Wire board", zone="rear")

    client.patch(f"/api/tasks/{slug}", json={"zone": None, "title": "Wire the board"})

    task = client.get(f"/api/tasks/{slug}").json()
    assert task["zone"] is None
    assert task["title"] == "Wire the board"


def test_undo_through_the_api(client: TestClient) -> None:
    slug = new_task(client, "Wire board")
    change = client.post(f"/api/tasks/{slug}/state", json={"state": "done"}).json()["change"]

    assert client.post(f"/api/changes/{change['id']}/undo").status_code == 200

    assert client.get(f"/api/tasks/{slug}").json()["state"] == "todo"


def test_undo_conflict_returns_409(client: TestClient) -> None:
    slug = new_task(client, "Wire board")
    change = client.post(f"/api/tasks/{slug}/state", json={"state": "doing"}).json()["change"]
    client.post(f"/api/tasks/{slug}/state", json={"state": "done"})

    assert client.post(f"/api/changes/{change['id']}/undo").status_code == 409


def test_notes_verification_and_staleness(client: TestClient) -> None:
    client.post("/api/notes", json={"title": "Height", "slug": "height", "body": "1420mm", "type": "Measurement"})
    client.post("/api/notes", json={"title": "Price", "slug": "price", "body": "£24", "stale_after": "2026-01-01T00:00:00+00:00"})

    notes = {note["slug"]: note for note in client.get("/api/notes").json()}
    assert notes["height"]["needs_verifying"] is True
    assert notes["price"]["stale"] is True
    assert notes["price"]["needs_verifying"] is False

    client.post("/api/notes/height/verify")

    note = client.get("/api/notes/height").json()
    assert note["verified"] is True and note["needs_verifying"] is False
    assert "1420mm" in note["body"]


def test_search_finds_tasks_and_notes(client: TestClient) -> None:
    new_task(client, "Fit the fridge")
    client.post("/api/notes", json={"title": "Venting", "body": "The fridge needs a vent."})

    kinds = {hit["kind"] for hit in client.get("/api/search?q=FRIDGE").json()}

    assert kinds == {"task", "note"}


def test_log_is_paged_newest_first(client: TestClient) -> None:
    new_task(client, "One")
    new_task(client, "Two")

    lines = client.get("/api/log?limit=1").json()

    assert len(lines) == 1
    assert lines[0]["text"] == "Two"


def test_graph(client: TestClient) -> None:
    a = new_task(client, "A")
    b = new_task(client, "B", depends_on=[{"task": a, "strength": "soft"}])

    graph = client.get("/api/graph").json()

    assert {node["slug"] for node in graph["nodes"]} == {a, b}
    assert graph["edges"] == [{"from": a, "to": b, "strength": "soft"}]


def test_problems_are_exposed(client: TestClient) -> None:
    store: Store = client.app.state.store
    (store.root / "tasks").mkdir(exist_ok=True)
    (store.root / "tasks" / "broken.md").write_text("no frontmatter")

    assert client.get("/api/problems").json()[0]["code"] == "unreadable-file"


def test_writes_go_to_the_files(client: TestClient) -> None:
    slug = new_task(client, "Wire board")

    store: Store = client.app.state.store

    assert (store.root / f"tasks/{slug}.md").exists()


def test_shopping_groups_purchases_and_totals_costs(client: TestClient) -> None:
    decide = new_task(client, "Choose", kind="decision")
    new_task(client, "Blocked item", kind="purchase", cost=100, depends_on=[{"task": decide}])
    free = new_task(client, "Free item", kind="purchase", cost=40)
    coming = new_task(client, "Coming", kind="purchase")
    arrived = new_task(client, "Arrived", kind="purchase", cost=25)
    new_task(client, "Not a purchase")
    client.post(f"/api/tasks/{coming}/state", json={"state": "doing"})
    client.post(f"/api/tasks/{arrived}/state", json={"state": "done"})

    shopping = client.get("/api/shopping").json()

    assert [item["slug"] for item in shopping["to_order"]] == [free, "blocked-item"]
    assert shopping["to_order"][1]["blocked_by"][0]["slug"] == decide
    assert [item["slug"] for item in shopping["on_order"]] == [coming]
    assert (shopping["still_to_spend"], shopping["spent"], shopping["unpriced"]) == (140, 25, 1)


def test_arrival_unblocks_what_now(client: TestClient) -> None:
    part = new_task(client, "Part", kind="purchase")
    new_task(client, "Fit part", depends_on=[{"task": part}])
    assert client.get("/api/what-now").json()["can_do"] == []

    client.post(f"/api/tasks/{part}/state", json={"state": "done"})

    assert [item["title"] for item in client.get("/api/what-now").json()["can_do"]] == ["Fit part"]


def test_chat_routes_say_when_the_ai_is_not_configured(client: TestClient) -> None:
    assert client.post("/api/sessions", json={}).status_code == 503


def test_chat_over_http(tmp_path: Path) -> None:
    import json

    from wtf_now.chat import Chat, SessionStore
    from wtf_now.proposals import ProposalStore

    from .test_agent import ScriptedModel, call, text

    store = Store(tmp_path / "bundle", clock=lambda: NOW)
    store.initialise()
    store.apply([Op("create_task", {"title": "Wire board"})])
    model = ScriptedModel(
        [
            text("Proposing."),
            call(
                "propose_changes",
                summary="Add a task",
                changes=[{"operation": "create_task", "args": {"title": "New"}}],
            ),
        ],
        [text("Over to you.")],
    )
    chat = Chat(model, store, SessionStore(tmp_path / "s", lambda: NOW), ProposalStore(tmp_path / "p", store), lambda: NOW)
    client = TestClient(create_app(store, clock=lambda: NOW, chat=chat))

    session = client.post("/api/sessions", json={}).json()
    stream = client.post(f"/api/sessions/{session['id']}/messages", json={"text": "Hi"})
    events = [json.loads(line[6:]) for line in stream.text.splitlines() if line.startswith("data: ")]

    proposal = next(event for event in events if event["type"] == "proposal")
    assert client.get("/api/proposals").json()[0]["id"] == proposal["id"]
    assert client.post(f"/api/proposals/{proposal['id']}/approve").json()["status"] == "applied"
    assert client.get("/api/proposals").json() == []
    shown = client.get(f"/api/sessions/{session['id']}").json()["display"]
    assert next(item for item in shown if item["type"] == "proposal")["status"] == "applied"
    assert client.post(f"/api/proposals/{proposal['id']}/approve").status_code == 422
    assert client.get("/api/sessions/nothing").status_code == 404


@pytest.fixture
def served(tmp_path: Path) -> TestClient:
    web = tmp_path / "dist"
    (web / "assets").mkdir(parents=True)
    (web / "index.html").write_text("the app")
    (web / "assets" / "app.js").write_text("code")
    (tmp_path / "secret.txt").write_text("private")
    store = Store(tmp_path / "bundle", clock=lambda: NOW)
    store.initialise()
    return TestClient(create_app(store, clock=lambda: NOW, static_root=web))


def test_serves_the_built_frontend(served: TestClient) -> None:
    assert served.get("/").text == "the app"
    assert served.get("/assets/app.js").text == "code"


def test_screen_links_fall_back_to_the_app(served: TestClient) -> None:
    assert served.get("/tasks/wire-board").text == "the app"


def test_api_routes_are_not_shadowed(served: TestClient) -> None:
    assert served.get("/api/health").json() == {"status": "ok"}
    assert served.get("/api/nothing").status_code == 404


def test_files_outside_the_frontend_are_not_served(served: TestClient) -> None:
    assert "private" not in served.get("/..%2fsecret.txt").text
    assert "private" not in served.get("/assets/..%2f..%2fsecret.txt").text
